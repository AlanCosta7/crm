# Plano de Desenvolvimento — Serviço de Captação de Leads (WizMart Forms)

> **Objetivo:** endpoint público e seguro que recebe formulários dos sites e landing pages do cliente e cria o lead diretamente no CRM (funil de entrada), com proteção anti-bot, documentação de integração para o cliente e testes unitários.
>
> **Data do plano:** 11/07/2026 · **Status:** DEPLOYADO EM HOMOLOG E PRODUÇÃO — cenário cross-domain (LP em homolog, endpoint em prod) validado ponta a ponta em 24/07/2026. Aguardando validação final do Alan pela própria interface.

---

## 1. Visão geral da arquitetura

```
Site / Landing Page do cliente
        │  POST JSON (fetch) ou <form> + snippet wizforms.js
        ▼
https://wizmart-crm.web.app/api/leads        ← rewrite do Hosting
        │
        ▼
Cloud Function v2 `captureLead` (onRequest, southamerica-east1)
        │
        ├─ 1. CORS / Origin allowlist (por fonte)
        ├─ 2. API key (hash SHA-256 em `lead_sources`)
        ├─ 3. Anti-bot: honeypot + time-trap + rate limit (+ Turnstile opcional)
        ├─ 4. Validação Zod (payload, tamanho, formatos)
        ├─ 5. Dedupe (email/telefone nas últimas 24h → atualiza em vez de duplicar)
        ▼
Firestore `tenants/wizmart/`
        ├─ leads/{id}            ← registro bruto (auditoria + inbox)
        ├─ deals/{id}            ← card criado no 1º estágio do funil da fonte
        └─ (trigger) onLeadCreated → notificação + activity no card
```

**Por que Hosting rewrite (`/api/leads`)?** URL amigável e estável para o cliente, esconde a URL da function, e permite trocar a implementação sem quebrar as integrações já configuradas nos sites.

**Decisão de modelo:** o lead sempre grava em `leads` (imutável, auditoria) **e** vira `Deal` no funil configurado na fonte. Se o dedupe detectar repetição, só registra uma `activity` no deal existente ("novo contato pelo site X").

---

## 2. Modelo de dados

### 2.1 `tenants/{tid}/lead_sources/{sourceId}` — fontes de captação (gerenciadas pelo manager/master)

```ts
interface LeadSource {
  id: string;
  name: string;                    // "Landing Page Smart Café", "Site institucional"
  apiKeyHash: string;              // SHA-256 da chave; a chave é exibida UMA vez na criação
  apiKeyPrefix: string;            // "wzk_ab12…" p/ identificação visual na UI
  allowedOrigins: string[];        // ["https://wizmart.com.br", "https://lp.wizmart.com.br"]
  funnelId: string;                // funil de destino
  productId: ProductId;            // wizmart | smart_cafe
  defaultOwner?: string;           // uid do BDR/SDR que recebe, ou null p/ fila
  turnstileEnabled: boolean;       // exige token Cloudflare Turnstile
  isActive: boolean;               // kill-switch imediato
  createdAt: Timestamp;
  stats?: { received: number; blocked: number; lastLeadAt?: Timestamp };
}
```

### 2.2 `tenants/{tid}/leads/{leadId}` — registro bruto (write só via Admin SDK)

```ts
interface Lead {
  id: string;
  sourceId: string;
  status: 'new' | 'converted' | 'duplicate' | 'discarded';
  dealId?: string;                 // deal criado/atualizado
  data: {                          // campos do formulário (validados)
    name: string;
    email?: string;                // email OU phone obrigatório
    phone?: string;
    company?: string;
    message?: string;
    custom?: Record<string, string>;  // até 10 campos extras, 500 chars cada
  };
  tracking: {                      // capturado automaticamente
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmTerm?: string; utmContent?: string;
    pageUrl?: string; referrer?: string;
  };
  meta: { ip: string; userAgent: string; origin: string };
  createdAt: Timestamp;
}
```

### 2.3 Alterações em tipos existentes

- `Deal`: novo campo opcional `leadOrigin?: { leadId: string; sourceId: string; sourceName: string; utm?: {...} }` — exibido no `DealSidebar` como badge "Origem: Site".
- `rate_limits/{key}` (coleção raiz, TTL): janela deslizante por IP e por fonte.

### 2.4 Firestore Rules

- `lead_sources`: manager/master lê e gerencia (o hash não é segredo crítico, mas write só manager); **nunca** expor a chave em claro (não é armazenada).
- `leads`: `write: false` para todos os clients (só Admin SDK); read para manager/master (e owner do deal).
- `rate_limits`: `read/write: false` (só Admin SDK) + política TTL no campo `expiresAt`.

---

## 3. Camadas de segurança (defesa em profundidade)

| # | Camada | Como funciona | Barra |
|---|--------|--------------|-------|
| 1 | **API key por fonte** | Header `X-WizMart-Key`; comparação por hash SHA-256; kill-switch `isActive` | Requisições anônimas/aleatórias |
| 2 | **Origin allowlist** | `Origin`/`Referer` deve casar com `allowedOrigins` da fonte; CORS restrito por fonte | Chave vazada usada em outro site |
| 3 | **Honeypot** | Campo oculto `website` no form; se preenchido → responde 200 e descarta (bot não sabe que falhou) | Bots que preenchem tudo |
| 4 | **Time-trap** | Snippet grava timestamp de render; submit < 3s da renderização → descarta | Bots de submit instantâneo |
| 5 | **Rate limit** | Máx. 5/min por IP e 60/h por fonte (janela deslizante em `rate_limits`) | Flood / spam em massa |
| 6 | **Cloudflare Turnstile (opcional por fonte)** | Token validado server-side (secret no Secret Manager); gratuito e sem fricção p/ usuário | Bots sofisticados |
| 7 | **Validação Zod** | Schema estrito, limite de 16KB no body, formatos de email/telefone BR, máx. 10 campos custom | Payloads maliciosos/injeção |
| 8 | **Dedupe** | Mesmo email/telefone + fonte em 24h → não cria novo deal | Duplicatas e replay |
| 9 | **Controle de custo** | `maxInstances: 2`, timeout 15s, memória 256MB | Ataque de billing |

Respostas de erro **nunca** revelam qual camada barrou (sempre `400 {"error":"invalid_request"}` genérico para bloqueios anti-bot; `401` só para chave ausente/inválida; `429` para rate limit).

---

## 4. Fases de desenvolvimento

### Fase 0 — Decisões e fundação (0,5 dia)
- [ ] Confirmar com o cliente: quais sites/LPs vão integrar, se querem Turnstile, e para qual funil/estágio cada fonte aponta.
- [x] Definir distribuição do lead: owner fixo por fonte (MVP) vs. round-robin entre BDRs (futuro). → **MVP: owner fixo (`defaultOwner`) por fonte.**
- [x] Tipos `LeadSource`, `Lead`, `Deal.leadOrigin` em `src/types/crm.ts` + espelho nos types das functions. *(11/07/2026)*

### Fase 1 — Núcleo do endpoint + testes unitários (2 dias) ✅ CONCLUÍDA 11/07/2026
- [x] `functions/src/leads/` com módulos **puros e testáveis**:
  - `validation.ts` — schema Zod do payload, normalização de telefone BR/email.
  - `antibot.ts` — honeypot, time-trap, verificação de origin (funções puras) + `verifyTurnstile` (fetch injetável).
  - `apiKey.ts` — geração `wzk_` + 32 bytes random, hash SHA-256, comparação em tempo constante.
  - `rateLimit.ts` — janela deslizante pura (`applyRateLimit`); persistência via transação no captureLead.
  - `dedupe.ts` — chave de dedupe (email/telefone normalizado + sourceId).
- [x] `captureLead.ts` (onRequest, southamerica-east1, maxInstances 2) orquestrando as camadas.
- [x] Rewrite no `firebase.json`: `/api/leads` → `captureLead`.
- [x] **Testes unitários (vitest no diretório functions):** 75 testes verdes cobrindo casos felizes + ataques. Setup: vitest devDep nas functions, `*.test.ts` excluído do build tsc (não vai pro deploy), script `npm test`.

### Fase 2 — Persistência, deal e notificação (1,5 dia) ✅ CONCLUÍDA 11/07/2026
- [x] Gravação do `Lead` + criação do `Deal` no 1º estágio do funil da fonte (batch), com `leadOrigin` e UTMs. *(feita junto com a Fase 1, dentro do captureLead)*
- [x] Dedupe ativo: lead duplicado → `status: 'duplicate'` + `activity` no deal existente.
- [x] Trigger `onLeadCreated`: activity "Lead recebido via [fonte]" no deal + notificação in-app em `tenants/{tid}/notifications` p/ o owner do deal (ou todos os masters/managers se a fonte não tem owner). A UI do sino de notificações entra na Fase 3.
- [x] Firestore rules (`leads`, `lead_sources`, `rate_limits`, `notifications` — usuário lê as próprias e só pode marcar `read`) + índices (leads dedupeKey+createdAt, sourceId+createdAt, notifications userId+createdAt, fieldOverride collection-group em lead_sources.apiKeyHash).
- [x] Teste integrado no emulador: `npm run test:leads` (scripts/test-emulator/test-leads-endpoint.mjs via emulators:exec) — 26 asserções verdes cobrindo: POST válido (lead+deal+activity+notificação), duplicado sem deal novo, honeypot com sucesso falso, chave inválida 401, origin 403, fonte desativada 401, payload inválido 400, flood 429, contadores stats.

### Fase 3 — UI de gestão no CRM (1,5 dia) ✅ CONCLUÍDA 11/07/2026

> **Princípio: autoatendimento total do admin master.** Domínios permitidos, fontes, chaves e destino do lead são dados no Firestore (não código). A function lê `lead_sources` a cada requisição, então qualquer alteração feita pelo master na UI vale **imediatamente**, sem redeploy e sem depender de sustentação. Surgiu site novo → master cadastra a fonte/domínio e cola o snippet no site, e pronto.

- [x] `SettingsPage` → nova aba "📥 Captação de Leads" (`LeadSourcesPane.tsx`): listar fontes, criar (modal exibe a chave **uma única vez** com botão copiar), editar domínios permitidos/funil/owner, kill-switch (ativar/desativar), rotacionar chave, excluir (só master), contadores recebidos/bloqueados, endpoint com botão copiar.
- [x] Geração da chave feita **no navegador** (`leadSourceKey.ts`, Web Crypto `crypto.subtle` + `crypto.getRandomValues`) — mesmo formato `wzk_`+SHA-256 do backend; só o hash é enviado ao Firestore, a chave em claro nunca trafega para o servidor.
- [x] Badge "Origem: [fonte]" + badges de UTM no `DealSidebar` quando o deal veio de captação.
- [x] Sino de notificações real no `Topbar` (`NotificationsBell.tsx`): lê `tenants/{tid}/notifications` do usuário logado, contador de não lidas, marcar como lida (individual/todas), clique navega ao pipeline. Antes era um botão estático sem função.
- [x] Testes de componente (testing-library): 14 testes novos (`leadSourceKey.test.ts` + `LeadSourcesPane.test.tsx`) cobrindo geração de chave, criação de fonte (verifica que só o hash é persistido, nunca a chave), kill-switch, rotação, exclusão restrita a master.

### Fase 4 — Snippet `wizforms.js` + Turnstile (1 dia) ✅ CONCLUÍDA 11/07/2026
- [x] `public/wizforms.js` (vanilla, ~9KB, sem dependências, UMD) servido pelo Hosting em `https://wizmart-crm.web.app/wizforms.js`:
  - Intercepta `<form data-wizmart-key="...">`, injeta honeypot + timestamp de render, captura UTMs/pageUrl/referrer da URL atual, faz o POST, mostra mensagem de sucesso/erro configurável (`data-wizmart-success`/`-error`), suporta redirect pós-sucesso (`data-wizmart-redirect`) e endpoint customizável (`data-wizmart-endpoint`, útil p/ homolog).
  - Modo alternativo: função global `WizMartForms.submit(payload, { key })` p/ integração direta sem `<form>`.
  - `WizMartForms.init()` é idempotente (não religa/duplica honeypot em forms já vinculados — usa `data-wizmart-bound`).
- [x] Integração Turnstile: atributo `data-wizmart-turnstile-sitekey` no `<form>` faz o snippet injetar sozinho o script oficial da Cloudflare + o widget `.cf-turnstile` (idempotente); o token resultante (`cf-turnstile-response`, nome que o próprio Turnstile usa) é harvestado automaticamente pelo snippet como `_turnstile`. **Decisão de design:** o snippet não decide dinamicamente "a fonte exige Turnstile" (exigiria endpoint público extra); quem integra o site simplesmente inclui o atributo quando a fonte tiver `turnstileEnabled=true` no CRM — documentar isso na Fase 5. Secret `TURNSTILE_SECRET` agora declarado em `captureLead.ts` (`secrets: ["TURNSTILE_SECRET"]`) — **precisa existir no Secret Manager antes do deploy** (`firebase functions:secrets:set TURNSTILE_SECRET`).
- [x] Testes unitários das funções do snippet: `wizformsSnippet.test.ts` (17 testes) — carrega o arquivo `.js` real de produção via `?raw` do Vite + `new Function` forçando o branch UMD/CommonJS (sem duplicar lógica em cópia TS), cobrindo parseUtmParams, mapFieldsToPayload (custom fields, campos de controle ignorados), buildLeadPayload com `<form>` real, honeypot, injeção idempotente do Turnstile, e `submit()` com fetch mockado.

### Fase 5 — Documentação do cliente (1 dia) ✅ CONCLUÍDA 11/07/2026
- [x] `docs/WizMart-Guia-Captacao-Leads.html` — mesmo padrão visual do Guia Admin Master (paleta verde #1A6B1A/#8DB600, Sora+Inter, molduras de print com fallback automático), em linguagem simples, 10 seções:
  1. Como funciona (diagrama de fluxo Site → WizMart Forms → CRM).
  2. Criando uma fonte no CRM e guardando a chave (com aviso de que ela só aparece uma vez).
  3. Gerenciando domínios permitidos sozinho (site novo, troca de domínio, kill-switch, rotação de chave) — sem precisar de suporte técnico.
  4. **Opção A (recomendada):** colar o snippet + atributo `data-wizmart-key` no form existente — exemplo copy-paste completo com blocos de código copiáveis (botão "Copiar" via JS inline) e tabela dos atributos opcionais (success/error/redirect).
  5. Verificação anti-robô (Turnstile) — quando ativar e como colar o atributo `data-wizmart-turnstile-sitekey`.
  6. **Opção B:** integração direta via HTTP (para dev do cliente) — request/response de exemplo, tabela resumida de códigos de erro, aponta para o API-LEADS.md.
  7. Receitas: WordPress/Elementor (bloco HTML personalizado), RD Station/outros LP builders (campo embed), formulário HTML puro.
  8. UTMs: como as campanhas aparecem no card do CRM (badge de origem + UTMs).
  9. Checklist de teste ("preencha o form → veja o card no funil em até 10s", conferir contador "Recebidos").
  10. Tabela de dúvidas comuns/troubleshooting (sintoma → causa provável → o que fazer).
  - Prints referenciados (`docs/assets/leads-01-lista.png`, `leads-02-chave.png`) documentados em `docs/COMO-INSERIR-OS-PRINTS.md` (expandido para cobrir os dois guias).
- [x] Seção técnica de referência da API em `docs/API-LEADS.md` (contrato JSON completo campo a campo, headers, todos os códigos de erro incluindo o comportamento de "sucesso falso" do anti-bot, limites de rate limit/payload/custom fields, regra de dedupe, boas práticas).

### Fase 6 — Testes finais, deploy e monitoramento (1 dia) — EM ANDAMENTO
- [x] E2E no emulador: `npm run test:leads` — 26/26 cenários verdes (válido/duplicado/honeypot/chave inválida/origin/fonte inativa/payload inválido/flood).
- [x] **Achado e corrigido antes do deploy:** 6 Cloud Functions antigas (`onDealCreate`, `onTaskComplete`, `onDealWon`, `onDealStageChanged`, `onCoinTransactionCreated`, `onActivityCompleted`) nunca tinham `region` explícito no código — em **homolog** isso causou duplicatas órfãs em `us-central1` (a versão válida, alinhada com a decisão de custo do projeto, estava em `southamerica-east1`) que travavam qualquer deploy de functions via CLI. Corrigido: adicionado `region: "southamerica-east1"` explícito nas 6 + na minha própria `onLeadCreated.ts` (tinha o mesmo problema), apagadas as 6 órfãs de `us-central1` em homolog (`firebase functions:delete ... --region us-central1 --project codifyx7`).
- [x] **Corrigido também:** hosting site fixo (`"site": "wizmart-crm"`) no `firebase.json` não existe no projeto homolog (lá o CRM usa `crm-codifyx`). Migrado para Firebase Hosting Targets (`wizmart-crm-app` → `wizmart-crm` em prod, → `crm-codifyx` em homolog) — `firebase.json` agora usa `"target": "wizmart-crm-app"`, funciona nos dois projetos sem duplicar config. Não afeta o workflow do GitHub Actions (usa `projectId`, resolve o target automaticamente).
- [x] Secret `TURNSTILE_SECRET` criado em homolog (`codifyx7`) com valor placeholder `not-configured-yet` — Turnstile segue desativado até haver uma chave real do Cloudflare.
- [x] **Deploy em homolog (codifyx7) concluído:** functions (`captureLead`, `onLeadCreated`) + firestore rules + índices + hosting (front com a aba Captação de Leads + `wizforms.js` + rewrite `/api/leads`). Índices/rules conferidos ANTES do deploy — nenhum dos 17 índices pré-existentes (compartilhados com outros produtos no mesmo projeto) foi alterado/removido.
- [x] **Smoke test end-to-end em homolog real** (não emulador): criada fonte de teste temporária, POST real via `https://crm-codifyx.web.app/api/leads` → 201, lead `converted`, deal criado no 1º estágio, `leadOrigin` gravado, activity "Lead recebido" criada pelo trigger. Dados de teste removidos depois. **Nota:** o índice collection-group (`lead_sources.apiKeyHash`) leva alguns minutos pra ficar pronto após o deploy em ambiente real (diferente do emulador, instantâneo) — gerou um 500 transitório no primeiro teste, resolvido sozinho após a indexação terminar.
- [x] **Landing page de teste publicada:** `public/teste-captacao-leads.html` → `https://crm-codifyx.web.app/teste-captacao-leads.html` — LP fake "Smart Café" com o snippet `wizforms.js` REAL (mesmo arquivo de produção), painel de configuração de chave no topo (colar chave ou `?key=wzk_...` na URL, persiste em localStorage) e painel de depuração que mostra a requisição/resposta crua (intercepta `window.fetch` só nesta página). Validado ponta a ponta com fonte de teste temporária (criada e depois removida) — lead, deal e `leadOrigin.pageUrl` corretos.
- [x] **Bug encontrado e corrigido (24/07/2026):** o campo "Domínios permitidos" não extraía a origem de uma URL completa colada com path/query — o Alan colou a URL da página de teste inteira ao criar a fonte, e a checagem de origin (comparação exata) sempre falharia. Corrigido em `parseOriginsInput` (frontend) e `normalizeOriginEntry` (backend, `antibot.ts`): agora ambos extraem só `scheme://host[:port]` de qualquer URL colada, descartando path/query/hash. Testes atualizados/adicionados nos dois lados. Texto de ajuda do campo atualizado avisando que aceita colar a URL completa.
- [x] **Deploy prod (`wizmart-crm`) completado (24/07/2026):** o Alan já tinha feito deploy do hosting em produção por conta própria (front + `wizforms.js`), mas faltava o backend (functions `captureLead`/`onLeadCreated`, rules, índices) — endpoint retornava 404. Completei com o mesmo pacote e mesma cautela de homolog: conferido ANTES que nenhum dos 17 índices pré-existentes seria afetado (só 3 novos criados), secret `TURNSTILE_SECRET` criado (placeholder), rules já estavam atualizadas (deploy anterior do Alan aparentemente já incluiu rules).
- [x] **Cenário cross-domain validado ponta a ponta (24/07/2026)** — o pedido do Alan foi testar exatamente a topologia real do cliente: LP num domínio, CRM/endpoint em outro. LP de teste (`public/teste-captacao-leads.html`, hospedada em homolog) ganhou um seletor de ambiente (Homolog/Produção) na barra de config, trocando `data-wizmart-endpoint` dinamicamente sem precisar editar/redeployar a página. Teste real: LP em `https://crm-codifyx.web.app/teste-captacao-leads.html` → POST para `https://wizmart-crm.web.app/api/leads` (produção) → 201 → lead `converted` → deal criado em `inbound-wizmart` → activity do trigger `onLeadCreated`. Dados de teste limpos depois; a fonte real "Landpage Teste" do Alan (já com o domínio corrigido) foi mantida intacta para ele reutilizar.
- [ ] **Teste final do Alan pela própria interface** (não mais só via script): abrir a LP publicada, escolher o ambiente, colar a chave, enviar o formulário pelo navegador e conferir o card no CRM.
- [ ] Alerta de monitoramento (métrica de erros 5xx / leads bloqueados + e-mail) — **adiado a pedido do Alan**, não bloqueia o lançamento. Logs de erro/bloqueio já vão para o Cloud Logging normalmente via `console.error`/`console.warn` no `captureLead.ts`.

#### Pendências registradas (fora do escopo desta feature, não bloqueiam o lançamento)
- **Produção (wizmart-crm)** tem as mesmas 6 functions acima rodando em `us-central1` (nunca existiram em `southamerica-east1` lá — foram deployadas direto do código sem região, desde a criação do projeto). Migrar pra `southamerica-east1` em prod evita custo/latência de cross-region, mas envolve uma janela com as duas versões coexistindo — **tratar como tarefa separada**, a pedido do Alan.
- `onProjectRequestCreated`/`onProjectRequestChanged` rodam em `us-central1` mas o trigger do Firestore está em `southamerica-east1` (warning do próprio `firebase deploy`, cross-region hop desnecessário) — mesma categoria de problema, não corrigido ainda.

**Total estimado: ~8,5 dias úteis** (2 semanas com folga para feedback do cliente).

---

## 5. Contrato da API (resumo)

```
POST https://wizmart-crm.web.app/api/leads
Headers: Content-Type: application/json · X-WizMart-Key: wzk_...

{
  "name": "Maria Silva",                     // obrigatório
  "email": "maria@empresa.com.br",           // email OU phone obrigatório
  "phone": "(11) 98765-4321",
  "company": "Mercado Bom Preço",
  "message": "Quero saber mais sobre o Smart Café",
  "custom": { "cidade": "Campinas" },
  "_hp": "",                                 // honeypot (snippet injeta)
  "_ts": 1783190000000,                      // timestamp de render (snippet injeta)
  "_turnstile": "token...",                  // se a fonte exigir
  "tracking": { "utmSource": "google", "pageUrl": "https://..." }
}

→ 201 { "ok": true, "leadId": "..." }
→ 400 invalid_request · 401 invalid_key · 429 too_many_requests
```

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Chave exposta no HTML do site (inevitável em client-side) | Chave dá acesso **só a criar lead naquela fonte**; origin allowlist + rate limit + kill-switch limitam abuso; rotação de chave com 1 clique |
| Spam passa pelas camadas básicas | Ativar Turnstile na fonte (1 toggle), sem redeploy |
| Custo de invocações em ataque | `maxInstances: 2` + rate limit + resposta barata (rejeita antes de tocar o Firestore quando possível) |
| Cliente configura errado e "não chega lead" | Guia com checklist de teste + contadores recebidos/bloqueados na UI + tabela de troubleshooting |
| Duplicidade de contatos | Dedupe 24h por email/telefone normalizado |

## 7. Fora de escopo (registrar para o futuro)

- Round-robin / regras de distribuição automática entre BDRs.
- Webhook de saída (avisar sistemas do cliente quando o lead entra).
- Integração nativa com Meta Lead Ads / Google Lead Form (hoje: via LP própria).
- Painel de conversão por fonte/UTM (dá para montar depois em KPIs com os dados já capturados).
