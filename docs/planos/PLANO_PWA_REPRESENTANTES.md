# Plano — PWA Mobile-First para Representantes

> Alvo: novo ambiente simplificado, mobile-first, para o role `rep`
> Base: stack atual (React 19 + Vite + TypeScript + Tailwind 4 + Firebase), reaproveitando a feature de Notas Ricas já entregue (`PLANO_NOTAS_RICAS.md`)
> Data: 08/09/2026 · Status: **aprovado — decisões do cliente na seção 10** · projeto/deploy apartados do `wizmart-crm` (site `wizmart-rep`)

---

## 1. Contexto e objetivo

O Representante atua em campo, no celular, e hoje precisa navegar pelo CRM completo (Kanban, KPIs, configurações) para fazer o que na prática faz o tempo todo: **ver os cards agendados do dia e registrar o que aconteceu na visita** (nota de texto, foto da loja, áudio, vídeo, anexo).

O CRM completo (`PipelinePage`, `DashboardPage`, `DealSidebar` com 1.332 linhas) não é pensado para isso — é denso, carrega `recharts` + `@dnd-kit` + módulos de configuração que o Rep nunca usa, e não funciona offline.

**Objetivo:** um PWA instalável, carregamento rápido, com menu reduzido a 3-4 destinos, focado em:
1. Ver a agenda de cards do dia/semana
2. Abrir um card e registrar nota (texto/áudio/foto/vídeo/anexo)
3. Fazer check-in de visita realizada
4. Qualquer coisa mais complexa → link "Abrir no CRM completo"

Tudo gravado pelo Rep é o **mesmo dado do pipeline** — não há espelhamento a construir. O PWA escreve nas mesmas coleções Firestore (`deals`, `tenants/{tid}/notes`) que o Kanban já lê. Isso já está garantido pela arquitetura atual; o trabalho aqui é 100% de front-end (nova casca de UI) + infraestrutura de offline/PWA.

---

## 2. Decisão arquitetural

### 2.1 Projeto novo, pasta separada, deploy apartado

**Decisão (revista em 08/09/2026 a pedido do cliente): não haverá rota nova dentro do `wizmart-crm`. O Rep App é um projeto Vite próprio, em pasta irmã, com build e deploy independentes em um site de Hosting diferente.**

```
/Users/alancosta/Frella/CRM/
├── wizmart-crm/          # projeto atual — intocado
└── wizmart-rep-app/      # novo projeto — pasta, package.json, vite.config próprios
```

Motivo da mudança: isolar completamente o app do Representante do CRM completo — build separado, deploy separado, e (o ponto que motivou a decisão) **cache offline isolado por origem**, sem depender de disciplina de code-splitting dentro de um único bundle.

**Mesmo projeto Firebase, Hosting multi-site** — mantém um único backend (Firestore/Storage/Auth/Functions), que é o que garante o espelhamento automático com o pipeline sem nenhuma sincronização customizada:

```bash
# Site "wizmart-rep" já criado pelo cliente no mesmo projeto Firebase — falta só o target
firebase target:apply hosting rep-app wizmart-rep --project wizmart-crm
firebase target:apply hosting crm wizmart-crm --project wizmart-crm   # site principal existente
```

```json
// firebase.json — dois blocos de hosting, dois targets, duas pastas de saída
"hosting": [
  { "target": "crm",     "public": "wizmart-crm/dist",     "...": "regras existentes" },
  { "target": "rep-app", "public": "wizmart-rep-app/dist", "...": "manifest/SW próprios" }
]
```

```bash
# Deploy independente — nunca precisa buildar/deployar o CRM junto
firebase deploy --only hosting:rep-app --project wizmart-crm
```

**Decisão do cliente (08/09/2026):** URL final é `https://wizmart-rep.web.app` (padrão Firebase Hosting, sem domínio customizado por ora) — **origem diferente** do CRM completo, o que é exatamente o que garante o isolamento de cache do §2.2.

### 2.2 Por que origem diferente resolve o requisito de cache

IndexedDB, Cache Storage (usado pelo Service Worker/Workbox) e `localStorage` são **isolados por origem** (protocolo+host+porta) pelo próprio navegador — não por convenção do código, é uma garantia da plataforma. Como o Rep App vai responder em uma URL diferente do CRM completo, **não existe forma de o cache offline do Rep App vazar ou colidir com o cache do CRM completo**, mesmo que os dois usem a mesma versão do Firestore SDK com a mesma configuração de persistência. Isso substitui com uma garantia mais forte a alternativa anterior (uma única `db` compartilhada dentro do mesmo bundle, que exigiria cuidado manual).

Único ponto de atenção: como são origens diferentes, a **sessão do Firebase Auth não é compartilhada automaticamente** entre o Rep App e o CRM completo. **Decisão do cliente (08/09/2026): priorizar a melhor experiência possível** — não pedir login de novo ao trocar de app. A solução é um **handoff de token entre domínios** (padrão para SSO entre dois sites separados sobre o mesmo projeto Firebase), detalhado em §3.3.

### 2.3 Reaproveitamento de componentes (cópia controlada, não import cross-repo)

Sem rota comum nem monorepo, o reaproveitamento da feature de Notas Ricas (a peça mais valiosa e já validada: 232 testes, gravador de áudio, compressão de imagem, upload resumível) acontece por **cópia física** dos arquivos para dentro de `wizmart-rep-app/src/`, adaptando só o necessário:

| Origem (`wizmart-crm/src/...`) | Destino (`wizmart-rep-app/src/...`) | Adaptação necessária |
|---|---|---|
| `features/deals/notes/*` (`NotesTab`, `NoteComposer`, `NoteItem`, `MarkdownView`, `MarkdownToolbar`, `useNotes`, `markdownEdit`, `markdownSanitize`, `noteFeed`, `rehypeChecklistIndex`, `mediaProcess`, `AudioRecorder`, `MediaGrid`, `Lightbox`, `AudioPlayer`, `useAttachmentUpload`) | `features/notes/*` | Nenhuma na lógica — só caminhos de import |
| `config/firebase.ts` | `config/firebase.ts` | **Ganha persistência offline própria** (§7) — o original do CRM completo não é tocado |
| `types/crm.ts` (subconjunto: `Deal`, `Note`, `NoteAttachment`, `ProductId`, `Role`) | `types/crm.ts` (só o subconjunto usado) | Reduzir para o que o Rep App realmente lê/escreve |
| `stores/authStore` | `stores/authStore` | Idem, sem alteração de lógica |
| `utils/crmFormat.ts` (funções usadas pelas notas/agenda) | `utils/crmFormat.ts` | Copiar só as funções usadas |

**Trade-off assumido conscientemente:** uma evolução futura da feature de Notas no CRM completo não se propaga automaticamente para o Rep App — exige copiar de novo o trecho alterado. Para o volume de mudança esperado nessa feature (já está em manutenção, não em desenvolvimento ativo), isso é preferível a introduzir um monorepo/pacote compartilhado agora. Se a divergência virar dor real, a extração para um pacote npm interno (`@wizmart/notes-kit`) fica documentada aqui como próximo passo natural, não como retrabalho.

---

## 3. Escopo funcional

### 3.1 Dentro do PWA do Representante

| Funcionalidade | Detalhe | Reaproveita |
|---|---|---|
| Login | Mesmo Firebase Auth, tela dedicada mobile-first | `authStore`, `useAuth` |
| Agenda do dia | Cards onde `participantIds` contém o uid do Rep (e `assignedRepId === uid`) e `visitScheduledAt` é hoje ou está atrasado | Query sobre `deals` com `where('participantIds','array-contains',uid)` — ver nota técnica abaixo |
| Agenda da semana | Mesmos cards, agrupados por dia, com pull-to-refresh | — |
| Card do cliente (visão Rep) | Nome, empresa, endereço, telefone, contato, produto, estágio atual (texto, não Kanban), população/porte | Subconjunto de `Deal` já existente em `crm.ts` |
| Ações rápidas no card | Ligar (`tel:`), WhatsApp (`https://wa.me/`), abrir rota no Maps (`geo:` / `https://maps.google.com/?q=`) | Novo — trivial, só monta URL a partir de `deal.location`/telefone |
| Registrar nota | Texto (markdown), foto, vídeo, áudio, anexo — **componente idêntico ao já usado no CRM** | `NotesTab`/`NoteComposer` (import direto, zero reescrita) |
| Check-in de visita | Botão "Marcar visita realizada" → grava só `visitDoneAt` (ver nota técnica abaixo — **não** avança `deal.stage` automaticamente) | `useFirestoreMutations('deals')`, mesmo padrão das notas |
| Indicador de sincronização | Badge "2 pendentes de envio" quando offline | Novo (§7) |
| Notificação de agenda do dia | Push real ao acordar (ver gap em §8) | Novo |

> **Nota técnica (descoberta na Fase 0, 08-09/09/2026) — por que `participantIds`, não `responsibleId`:** a Firestore Security Rule de `deals` (`firestore.rules:130-131`, função `isDealParticipant`) autoriza leitura por `participantIds array-contains uid` (ou `owner`/`bdrId`/`assignedSdrId`/`assignedRepId` exatos) — **nunca** por `responsibleId`, que é só um campo de conveniência para filtro client-side depois que os dados já estão em mãos. O Firestore recusa **por inteiro** uma consulta de lista (`list`) sem um `where` que corresponda ao que a rule verifica — não filtra silenciosamente os documentos que a rule barraria, devolve `permission-denied` para a consulta inteira. Isso já era conhecido e resolvido no CRM completo por `src/utils/dealQueryScope.ts` (`dealParticipantConstraint`), e o Rep App teve que adotar o mesmo padrão (`src/features/agenda/useAgendaDeals.ts`). Vale também para o check-in: por isso ele grava só `visitDoneAt` — avançar `deal.stage` exigiria conhecer o grafo exato de estágios por funil (WizMart vs. Smart Café), que não foi confirmado contra a Cloud Function `onDealStageChanged` nesta fase.

### 3.2 Fora do escopo — redireciona para o CRM completo

- Kanban / mudar estágio manualmente para estágios fora do fluxo simples (ex.: mover para "Negociação Contratual", editar valor do deal)
- Criar novo lead/deal
- Cross-sell de produtos, solicitação de Projeto de Layout
- KPIs, Dashboard, Carteira de moedas, Loja de prêmios
- Configurações, gestão de usuários, metas

Cada tela do PWA tem um botão discreto "Abrir no CRM completo →". Sem nenhum tratamento, isso pediria login de novo (origens diferentes, §2.2) — a §3.3 resolve isso.

### 3.3 SSO entre Rep App e CRM completo (handoff de token) ✅ implementado e testado (09/09/2026)

**Decisão do cliente: priorizar a melhor experiência possível** — o Rep não deve perceber que são dois domínios diferentes ao trocar de um app para o outro.

Como os dois apps compartilham o mesmo projeto Firebase (mesmo Auth, só front-ends em origens diferentes), o padrão correto não é tentar compartilhar cookies/`localStorage` entre domínios (não funciona de forma confiável nem seria a prática recomendada) — é um **handoff de token de curta duração**:

```
1. Rep toca em "Abrir no CRM completo" (ex.: a partir do card X)
2. Rep App chama a Cloud Function callable `mintHandoffToken()`
   — já autenticado; a função nunca aceita um uid vindo do client,
     só usa request.auth.uid do próprio chamador
   → admin.auth().createCustomToken(uid) no servidor
3. Rep App redireciona para
   https://wizmart-crm.web.app/sso?token=<custom_token>&next=/lead/<dealId>
4. CRM completo tem uma rota leve /sso (não faz parte do menu, só existe
   para este handoff): lê o token, chama signInWithCustomToken(auth, token),
   e em caso de sucesso navega para `next` com history.replaceState
   (o token nunca fica visível na barra de endereço por mais que o instante
   do redirecionamento, e sai do histórico do navegador)
5. Falha (token expirado/usado fora da janela esperada) → tela de login
   normal do CRM completo, sem erro alarmante
```

**Por que é seguro:** o custom token do Firebase já expira em 1 hora por padrão e é trocado imediatamente após ser gerado (janela de exposição de segundos); a Cloud Function só emite token para o próprio usuário autenticado, nunca para um uid arbitrário; e a rota `/sso` do CRM completo não fica linkada em nenhum menu — só é alcançada por este redirecionamento controlado.

**Direção inversa** (CRM completo → Rep App) fica fora do escopo do MVP — não há um caso de uso claro para um `manager`/`master` "entrar como Rep" a partir do CRM completo.

---

## 4. Design UI

### 4.1 Princípios

- **Uma coisa por tela.** Sem sidebar, sem tabs múltiplas — bottom navigation com no máximo 4 ícones.
- **Alvos de toque ≥ 44px**, já é o padrão adotado em `PLANO_NOTAS_RICAS.md` §3.6 — mantido aqui.
- **Cores por produto já definidas** — reaproveitar sem criar paleta nova: WizMart verde `#1A6B1A`/lima `#8DB600`, Smart Café marrom `#92400E`/âmbar `#D97706`.
- **Estado de rede sempre visível** — faixa fina no topo ("Offline — suas notas serão enviadas ao reconectar") em vez de erro modal.

### 4.2 Navegação (bottom nav, 4 itens)

```
┌─────────────────────────────────────┐
│                                       │
│         (conteúdo da tela)           │
│                                       │
├─────────┬─────────┬─────────┬────────┤
│  🏠     │  📅     │  🔔     │  👤    │
│  Hoje   │  Agenda │  Avisos │  Perfil│
└─────────┴─────────┴─────────┴────────┘
```

### 4.3 Tela "Hoje" (home)

```
┌───────────────────────────────────────┐
│  Bom dia, Carlos          🟢 online   │
│  3 visitas hoje · 1 atrasada          │
├───────────────────────────────────────┤
│  🔴 ATRASADA                          │
│  ┌─────────────────────────────────┐ │
│  │ Mercadinho Silva      [WizMart] │ │
│  │ Visita agendada · ontem 14h     │ │
│  │ 📍 Osasco, SP                   │ │
│  │ [Ligar] [WhatsApp] [Abrir card] │ │
│  └─────────────────────────────────┘ │
│                                       │
│  HOJE                                 │
│  ┌─────────────────────────────────┐ │
│  │ Padaria Bom Pão    [Smart Café] │ │
│  │ 10:00 · Degustação Agendada     │ │
│  │ [Ligar] [WhatsApp] [Abrir card] │ │
│  └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### 4.4 Tela do Card (read-only + registrar)

```
┌───────────────────────────────────────┐
│  ← Mercadinho Silva          [WizMart]│
├───────────────────────────────────────┤
│  Visita Agendada · Osasco, SP         │
│  📞 (11) 9xxxx-xxxx   👤 João (dono)  │
│  [Ligar] [WhatsApp] [Rota]            │
├───────────────────────────────────────┤
│  ✅ Marcar visita como realizada       │
├───────────────────────────────────────┤
│  Notas e mídia                         │
│  ┌─────────────────────────────────┐ │
│  │ [📷 foto] [🎥 vídeo] [🎙️ áudio]  │ │  ← NoteComposer existente
│  │ [📎 anexo]           [Salvar]   │ │
│  └─────────────────────────────────┘ │
│  ── notas anteriores (timeline) ──    │
└───────────────────────────────────────┘
```

Este bloco de notas é o `<NotesTab dealId={id} />` **já existente**, sem alteração — é o ponto central do reaproveitamento.

### 4.5 Estados a desenhar

- Skeleton loading nos cards da agenda (não spinner de tela cheia — o app deve parecer instantâneo mesmo com Firestore ainda buscando)
- Vazio: "Nenhuma visita agendada para hoje 🎉"
- Offline com dado em cache: mostra os cards normalmente + faixa de aviso
- Offline sem cache (primeiro acesso sem nunca ter sincronizado): tela "Conecte-se à internet para carregar sua agenda pela primeira vez"

### 4.6 Tablet (decisão do cliente: precisa funcionar bem)

O smartphone continua sendo o alvo principal, mas o layout ganha um segundo breakpoint em vez de só esticar o mobile:

| Breakpoint | Layout |
|---|---|
| `< 768px` (smartphone) | Uma coluna, bottom nav, composer em bottom sheet — layout descrito em §4.2-4.4 |
| `≥ 768px` (tablet) | **Duas colunas**: lista da Agenda à esquerda (largura fixa ~360px) + Card selecionado à direita, sem navegação por troca de tela. Bottom nav vira uma barra lateral fina (rail) à esquerda. Composer de nota abre como painel lateral, não bottom sheet — o tablet tem espaço vertical de sobra e o teclado não cobre a tela inteira como no celular |

Reaproveita os mesmos componentes (`NotesTab`, cards da agenda) — é reorganização de layout via CSS/Tailwind (`md:` breakpoint), não uma segunda implementação. Testar em iPad (Safari) e tablet Android, que são os cenários mais prováveis de uso no PDV.

---

## 5. Arquitetura técnica do PWA

### 5.1 Instalabilidade

- `manifest.json` na raiz de `wizmart-rep-app/public/` (nome curto "WizMart Rep", ícone próprio — ver §10 sobre identidade visual), `display: 'standalone'`, `start_url: '/'`, `theme_color` por produto dominante do tenant.
- Ícones: **correção feita na Fase 0** — `wizmart-crm/public/favicon.svg` não é a marca WizMart, é um ícone genérico de placeholder (um raio roxo, provavelmente do scaffold inicial do projeto, nunca trocado). A marca real só existe como componente React (`<Logo>`: carrinho + wifi em gradiente verde `--grad`, renderizado ao vivo). Os ícones do manifest (192/512/maskable) foram recompostos a partir dos mesmos paths SVG do lucide-react (`shopping-cart`, `wifi`) usados pelo `<Logo>`, no mesmo gradiente `linear-gradient(135deg, #1A6B1A, #8DB600)` — uma reprodução fiel da marca ao vivo, não do favicon genérico. Gerados via `qlmanage` (QuickLook do macOS) a partir de um SVG fonte montado à mão; ficam versionados como PNG em `public/` (192/512/maskable).
- `vite-plugin-pwa` (Workbox) — dependência nova só no `package.json` do `wizmart-rep-app` (o `wizmart-crm` não ganha essa dependência):
  - Precache do app shell (todo o bundle do Rep App, que é pequeno por construção — projeto próprio, sem import possível do Kanban/Recharts)
  - `registerType: 'autoUpdate'` com toast "Nova versão disponível — atualizar" (não forçar reload, o Rep pode estar no meio de uma nota)
  - Runtime caching `CacheFirst` para os ícones/fontes; `NetworkOnly` para chamadas Firestore/Storage (o SDK do Firebase já cuida do próprio cache — ver §7)
  - Escopo do Service Worker é a origem inteira do Rep App (`/`) — não há risco de o SW interceptar nada do CRM completo, são domínios diferentes

### 5.2 Por que não Edge/Service Worker próprio para dados

O Firestore SDK já implementa cache + fila de escrita offline nativamente (§7). Um Service Worker de dados customizado (interceptar `fetch` para a API do Firestore) duplicaria essa lógica e é desencorajado pelo próprio Firebase — o Workbox aqui deve cuidar **só** de assets estáticos (app shell), nunca de dados.

---

## 6. Performance — carregamento rápido

### 6.1 Orçamento de bundle — medido, não estimado

> Atualizado após o primeiro build real do `wizmart-rep-app` (Fase 0, 08-09/09/2026). Os números abaixo substituem a estimativa original deste documento, que era otimista demais para `firebase`.

| Chunk | Medido (gzip) | Carregamento |
|---|---|---|
| `index` (código próprio do app) | 20,8 KB | Eager |
| `vendor` (react+react-dom+react-router-dom+react-query+zustand+lucide-react) | 99,7 KB | Eager |
| `firebase` (auth+firestore com persistência offline+storage) | 190,9 KB | Eager |
| CSS (`index.css` herdado + `rep-app.css`) | 9,6 KB | Eager |
| `markdown` (react-markdown+remark+rehype) | 50,5 KB | **Lazy** — só ao abrir a aba de Notas |
| **Total eager** | **≈ 321 KB gz** | |

**Por que `firebase` sozinho já passa da meta original de "< 120 KB gz inicial":** o Firestore Web SDK com listeners em tempo real (`onSnapshot`) e cache offline (`persistentLocalCache`) embute um cliente gRPC-Web baseado em protobuf — isso é peso estrutural do SDK, não uma escolha de implementação nossa, e não existe uma versão "leve" do Firestore que preserve tempo real + offline (o `firebase/firestore/lite` existe, mas troca exatamente essas duas capacidades por bytes, e ambas são requisitos centrais deste app). A meta de "< 120 KB gz" era uma estimativa de planejamento que não tinha sido validada contra um build real — mantida aqui como registro do que foi corrigido, não como meta ainda em aberto.

**O que era bug e já foi corrigido:** o `Icon.tsx` copiado do wizmart-crm fazia `import * as LucideIcons from 'lucide-react'` (import de namespace, usado dinamicamente via `LucideIcons[name]`) — isso impede tree-shaking e embarcava o pacote de ~1500 ícones inteiro. Substituído por imports nomeados explícitos de só os ~50 ícones realmente usados no Rep App (`src/components/ui/Icon.tsx`); o chunk `vendor` caiu de 283 KB para 99,7 KB gz só com essa mudança. `react-icons` (usado no original só para o ícone de marca do LinkedIn, que este app nunca mostra) também foi removido.

**O que segue fora do bundle, como planejado:** `recharts`, `@dnd-kit`, `animejs` e tudo do Kanban/Dashboard/Gamificação — essas dependências nunca entraram no `package.json` do Rep App, então não há como vazarem para o bundle.

### 6.2 Por que não precisa de regra de `manualChunks` para "proteger" o bundle

No desenho anterior (rota dentro do mesmo repositório) seria necessário garantir, via `manualChunks` e testes de build, que nada do Kanban/Recharts/gamificação vazasse para o bundle do Rep. Com projeto próprio isso deixa de ser um risco: o `wizmart-rep-app/package.json` simplesmente **não tem** `recharts`, `@dnd-kit` nem `animejs` como dependência — não há import possível. O `manualChunks` do `vite.config.ts` do Rep App só precisa separar `firebase` (chunk grande, cacheável isoladamente) e `markdown` (lazy), replicando o padrão já usado no `wizmart-crm`.

### 6.3 Outras táticas já provadas no projeto

- Lazy loading do composer de notas (`React.lazy` + `Suspense`) — já é o padrão usado em `DealSidebar.tsx`.
- Compressão de imagem/thumbnail client-side (`mediaProcess.ts`) — reaproveitado sem alteração.
- `loading="lazy"` em todo `<img>` da agenda (fotos de perfil da empresa, se houver).
- Meta de Lighthouse mobile: LCP < 1.8s em 4G simulado, TTI < 3s, bundle inicial < 150 KB gz total (JS+CSS).

---

## 7. Offline-first: o que já existe vs. o que falta construir

### 7.1 Cache offline do Firestore — só no `firebase.ts` do Rep App

O Firestore Web SDK do `wizmart-crm` **não tem** cache offline habilitado hoje (`getFirestore(app)` puro — confirmado, sem `enableIndexedDbPersistence`/`persistentLocalCache`) e **isso não muda** — o `wizmart-crm/src/config/firebase.ts` permanece exatamente como está. A persistência é configurada **apenas** no `wizmart-rep-app/src/config/firebase.ts` (arquivo próprio, copiado e adaptado conforme §2.3):

```ts
// wizmart-rep-app/src/config/firebase.ts — arquivo do NOVO projeto, não o do CRM completo
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

Como o Rep App roda em outra origem (§2.2), o IndexedDB dessa persistência fica fisicamente isolado do navegador do CRM completo — **não há como essa mudança afetar o projeto original**, mesmo que os dois `db` apontem para o mesmo backend Firebase. É a garantia que motivou a mudança de arquitetura desta seção.

Com isso, de graça, no Rep App:
- A agenda do dia (já visitada uma vez) abre instantaneamente offline, com os dados da última sincronização.
- Criar uma nota (texto puro) offline **funciona sozinho** — o SDK enfileira o `addDoc`/`setDoc` localmente e sincroniza ao reconectar, sem código adicional.
- Multi-aba (o Rep pode ter o PWA instalado e uma aba do navegador abertos ao mesmo tempo) já é coberto pelo `persistentMultipleTabManager`.

### 7.2 O que falta construir — fila de upload de mídia

Firebase Storage **não** enfileira upload enquanto offline (diferente do Firestore). Se o Rep grava um áudio sem sinal, o `uploadBytesResumable` falha na hora. É o único gap real de offline.

**Solução: fila própria em IndexedDB**

```
1. Rep grava áudio/foto/vídeo/anexa arquivo offline.
2. O blob vai para uma store IndexedDB própria (`pending_uploads`), com:
   { id, dealId, noteId, blob, kind, mime, createdAt, attempts }
3. A nota é criada no Firestore imediatamente (funciona offline, §7.1) com o
   attachment em estado `status: 'pending_local'` — aparece na timeline como
   "🎙️ Áudio (enviando quando houver rede)".
4. Listener em `window.addEventListener('online', ...)` + verificação ao
   abrir o app percorre a fila e chama `uploadBytesResumable` para cada item.
5. Ao concluir, atualiza o attachment (`status: 'uploaded'`, `url`, `storagePath`)
   e remove da fila IndexedDB.
6. Falha após reconectar (ex.: arquivo corrompido) incrementa `attempts`;
   acima de 5 tentativas, marca `status: 'failed'` e mostra ação manual
   "Tentar novamente" no item da timeline.
```

**Decisão do cliente: considerar cenários de instabilidade real, não só "offline vs. online".** O evento `online` do navegador não é confiável em campo — o dispositivo pode reportar "online" com sinal fraco, numa zona de sombra 4G ou atrás de um portal cativo, e a chamada falhar mesmo assim. Ajustes na fila para esse cenário:

- **Retry com backoff exponencial** por item (5s → 15s → 45s → 2min → 5min, teto de 5 tentativas antes de virar `failed` manual) em vez de uma única tentativa disparada pelo evento `online`.
- **Sonda de conectividade real**, não só o evento do navegador: antes de cada tentativa, uma checagem leve (ping a um endpoint do próprio Firebase, ex. `fetch` a um recurso pequeno do Storage com timeout curto) confirma que há rede de fato antes de gastar bateria/dados numa tentativa de upload que vai falhar.
- **Retry também roda periodicamente em foreground** (ex. a cada 30s enquanto o app está aberto e há itens pendentes), não só reagindo a transições de estado de rede — cobre o caso do Rep dirigindo entre pontos de venda com sinal instável, sem preservar o app em background o tempo todo.
- **Upload resumível de verdade**: `uploadBytesResumable` já retoma sozinho um upload que foi interrompido no meio (perda de pacote breve) — a fila só entra em ação quando o upload **nunca chegou a começar** (offline no momento da gravação) ou falhou por completo.
- **Teste de campo obrigatório** (não só emulado no DevTools): gravar uma nota com anexo em área de sinal fraco real, alternando 3-4 vezes entre sinal e zero sinal antes de finalmente enviar — cenário que reproduz o "elevador do PDV" citado como preocupação real do cliente.

**Reaproveita:** o tipo `NoteAttachment` já tem os campos certos (`kind`, `mime`, `size`) — só precisa de um novo valor de `source`/`status` para o estado pendente, e o componente `MediaGrid`/`NoteItem` já existente ganha um badge visual para esse estado (mudança pequena e localizada).

**Não reinventar:** `uploadBytesResumable` já retoma sozinho uma transferência interrompida por queda breve de rede (perda de pacote, túnel de elevador) — a fila IndexedDB só é necessária para o caso de **começar** offline, não para retomar um upload em andamento.

### 7.3 Indicador de sincronização pendente

Contador simples (tamanho da fila IndexedDB + Firestore `firestore.waitForPendingWrites()` como sinal complementar) alimentando o badge "N pendentes" no ícone de perfil/topo — sem necessidade de biblioteca nova.

---

## 8. Notificações — gap encontrado

O utilitário `src/utils/pwaNotifications.ts` hoje é a **Notification API do navegador em foreground** — não é push real: não há Service Worker registrado para push, não há integração com Firebase Cloud Messaging (FCM), então não funciona com o app fechado. O nome "PWA push" na Fase 9 do `CLAUDE.md` v2 está desalinhado com a implementação atual — vale corrigir essa nomenclatura no roadmap.

Para o Rep receber "Você tem 3 visitas hoje" com o app fechado, é necessário:
1. Service Worker de push dedicado (`firebase-messaging-sw.js`), registrado no projeto `wizmart-rep-app`.
2. `getToken()` do FCM + gravar o token em `users/{uid}.fcmTokens[]`.
3. Cloud Function agendada (Cron, ex. 7h BRT) que lê a agenda do dia por Rep e dispara via FCM Admin SDK.
4. Tratamento de permissão negada/revogada (mesma UX de erro já usada no gravador de áudio, §3.2 do plano de notas).

**Decisão do cliente: push entra no MVP.** Continua isolado como sua própria fase no roadmap (§9, Fase 4) — não porque seja cortável, mas porque depende de infraestrutura própria (Service Worker de push, FCM, Cloud Function agendada) que não se mistura com o trabalho de UI/offline das fases anteriores, então faz sentido validá-la separadamente antes do go-live.

---

## 9. Fases de desenvolvimento

> Estimativa total: **7 semanas** para 1 desenvolvedor familiarizado com o código atual (o reaproveitamento da feature de Notas é o que torna o prazo curto, mesmo com push e SSO incluídos no escopo).

### Fase 0 — Fundação (Semana 1) ✅ concluída (09/09/2026)
- [x] Criar `wizmart-rep-app/` (Vite + React 19 + TS + Tailwind 4, `package.json` próprio e enxuto)
- [x] Target de Hosting `rep-app` → site `wizmart-rep` configurado em `.firebaserc`/`firebase.json` próprios (deploy ainda não executado — falta só `firebase deploy --only hosting` com credenciais do Alan)
- [x] Copiar e adaptar `config/firebase.ts` com `persistentLocalCache` já habilitado (§7.1) — isolado por origem desde o primeiro commit
- [x] Copiar `features/deals/notes/*` (mantido em `features/deals/notes/` para preservar os imports relativos — ver §2.3) e o subconjunto de `types/crm.ts`/`authStore` usado
- [x] Router próprio (`react-router-dom`), sem relação com o router do `wizmart-crm`; `ProtectedRoute` restrito só ao role `rep`
- [x] Shell mobile: bottom nav, topo com indicador online/offline
- [x] `manifest.json` + ícones (variação do logo atual, gerados a partir do mark real do `<Logo>`, não do `favicon.svg` genérico — ver nota em §5.1) + `vite-plugin-pwa` configurado

### Fase 1 — Agenda, Card e SSO (Semana 2) — concluída (09/09/2026)
- [x] Tela "Hoje": query `deals` por `participantIds array-contains uid` + `visitScheduledAt`, agrupado atrasada/hoje (ver nota técnica em §3.1) — **testado de ponta a ponta contra os emuladores Firebase reais**, incluindo o ajuste de query que a security rule exigiu
- [x] Tela "Agenda" (semana + sem data), com todos os buckets — pull-to-refresh (gesto) segue não implementado; dado ser um app de listener em tempo real do Firestore (a lista já atualiza sozinha quando algo muda no servidor), o valor do gesto manual é baixo — deixado de fora conscientemente, não esquecido
- [x] Tela do Card: dados essenciais + ações rápidas (ligar/WhatsApp/rota) — testado
- [x] Skeleton loading nos cards da agenda + estado "offline sem cache" distinto do "vazio de verdade" (compara com `useOnlineStatus`) — `HomePage.tsx`/`AgendaPage.tsx`
- [x] Layout tablet mestre-detalhe — **testado visualmente** (`resize_window` + screenshot): lista à esquerda, `CardDetail` à direita, card selecionado com destaque verde, "Voltar" limpa a seleção sem navegar. `CardPage` foi dividido em `CardDetail.tsx` (conteúdo, reaproveitado nos dois layouts) + `CardPage.tsx` (wrapper de rota, só mobile)
- [x] Cloud Function `mintHandoffToken` (`wizmart-crm/functions/src/users/mintHandoffToken.ts`) + rota `/sso` (`wizmart-crm/src/features/auth/SsoPage.tsx`) + botão "Abrir no CRM completo" no Perfil do Rep App — **testado de ponta a ponta contra os emuladores**: clique no Rep App → `mintHandoffToken` → redireciona pro `/sso` do CRM completo → login automático, sem pedir senha, URL limpa (sem o token, `history.replace`) — cai direto no Dashboard como o mesmo usuário

**Achado extra, testado durante esta correção:** o estágio do card (`deal.stage`) é um id (`visita_agendada`), não um texto pronto — aparecia cru na tela. Adicionado `resolveStageName()` (`utils/stageName.ts`), que resolve via a coleção `funnels`. De quebra, confirmei que a consulta *sem filtro* de `funnels` (mesmo padrão de `contacts`/`sellers`) não esbarra na mesma restrição de segurança que bloqueou `deals` — só `deals` tem essa exigência de query filtrada, porque sua rule combina `canSeeAllDeals(tid) || isDealParticipant(data)` (um OU com bypass por role) com `canAccessDocProduct(data)`; `funnels`/`contacts` usam uma regra mais simples (E direto, sem OU), que o Firestore consegue provar seguro mesmo sem `where` correspondente. Não é uma garantia documentada — é o comportamento observado neste projeto; qualquer nova coleção com regra parecida com a de `deals` deve ser tratada com a mesma cautela (`dealQueryScope.ts`).

### Fase 2 — Notas e check-in (Semana 3) — parcialmente concluída (09/09/2026)
- [x] Integrar `<NotesTab dealId />` existente na tela do Card — sem modificar o componente; **testado**: nota de texto gravada pelo Rep App aparece na mesma coleção `tenants/{tid}/notes` que o CRM completo lê (confirmado via Admin SDK)
- [x] Botão "Marcar visita realizada" — **testado**, mas grava só `visitDoneAt` (ver nota técnica em §3.1); avançar `deal.stage` fica para quando o grafo de estágios for confirmado
- [ ] Validar em device real (iPhone + Android + iPad/tablet Android) — testado só no emulador de navegador até aqui; câmera/áudio/HEIC/teclado nativo ainda precisam de device físico

### Fase 3 — Offline de mídia e resiliência de rede (Semana 4) — concluída (09/09/2026)
- [x] Fila IndexedDB de uploads pendentes (`pending_uploads`) — `src/offline/pendingUploadsDb.ts`
- [x] Estado visual "enviando quando houver rede" — `PendingAttachmentRow.tsx`, separado de `MediaGrid`/`AudioPlayer`/`AttachmentCard` (esses três continuam assumindo que `attachment.url` existe; um anexo pendente ainda não tem)
- [x] Retry com backoff exponencial (5s→15s→45s→2min→5min, teto de 5 tentativas) + retry no evento `online` + retry periódico a cada 30s em foreground — `src/offline/uploadQueueProcessor.ts`
- [x] Indicador "N pendentes" — badge no ícone Perfil da bottom nav + faixa no topo (§7.3)
- [x] **Testado de ponta a ponta contra os emuladores reais**: anexei um arquivo com `navigator.onLine` forçado a `false`, salvei a nota (ficou com `attachments[0].status:'pending_local'` e `url:''` no Firestore, confirmado via Admin SDK), voltei o "online" e a fila enviou sozinha — o Firestore passou a ter a URL real do Storage e o campo `status` sumiu, idêntico a um anexo enviado online
- [x] Estado "falha após 5 tentativas" com ações Tentar novamente/Remover — testado (injetei um anexo `status:'failed'` e validei os dois botões)
- [ ] Teste de campo com sinal instável real (dispositivo físico, alternando sinal fraco/zero) — só testado com o `navigator.onLine` forçado via script; comportamento em rede realmente instável (não binário) ainda não validado em campo

**Bug real encontrado e corrigido durante o teste:** o Firestore recusa `undefined` como valor dentro de um array de mapas (`updateDoc` lança `invalid-argument`) — diferente de campo de topo, onde só é ignorado. O `uploadQueueProcessor` monta o anexo final com `thumbUrl`/`width`/`height`/`durationMs`, que ficam `undefined` para tipos sem essas propriedades (ex.: documento sem miniatura) — sem sanitizar antes de escrever, a atualização pós-upload falhava sempre. Corrigido com um `stripUndefined()` local (mesma ideia do `removeUndefined` que `useFirestoreMutations` já aplica no resto do app, mas o processador roda fora de React/desses hooks).

**Simplificação assumida em relação ao desenho original do §7.2:** em vez de uma sonda de conectividade separada (um fetch só para "testar" a rede antes de cada tentativa), a própria tentativa de upload serve de sonda — se falhar, tratamos como sinal de rede ruim e aplicamos o backoff. Mesmo resultado prático, uma chamada de rede a menos por ciclo.

### Fase 4 — Push real (Semana 5) — concluída (09/09/2026), com uma lacuna conhecida

- [x] Service Worker próprio (`src/sw.ts`) combinando precache do app shell (Workbox `injectManifest` — `generateSW` não dava por rodar dois SWs no mesmo escopo) com push em background via `firebase/messaging/sw` (a variante pensada para SW de módulo ES, evita o `importScripts` dos exemplos antigos)
- [x] `src/notifications/fcm.ts` (client) — `enablePushNotifications()` pede permissão, obtém o token FCM e grava em `tenants/{tid}/users/{uid}.fcmTokens` (write direto do client já autorizado pela rule existente — nenhuma Cloud Function nova precisou ser criada só para isso); `listenForegroundPush()` para quando o app está aberto
- [x] Cloud Function `sendRepDailyAgendaPush` (`0 7 * * *`, America/Sao_Paulo) — conta visitas de hoje por Rep via `participantIds array-contains uid` (mesma nota técnica do §3.1) e dispara `sendEachForMulticast`; limpa tokens mortos (`invalid-registration-token`/`registration-token-not-registered`)
- [x] Preferências de notificação no Perfil — estado consciente de `Notification.permission` (default/granted/denied/unsupported), com mensagem específica para cada caso
- [x] Tratamento de permissão negada e de ambiente sem VAPID key configurada — nenhum dos dois quebra o app, só desativam o push com uma mensagem clara

**O que foi testado, e como (sem simular o que não dá pra simular sem enganar a si mesmo):**
- Lógica de contagem "quantas visitas hoje" — 6 testes unitários puros (`repDailyAgendaPush.test.ts`), sem depender de emulador nenhum
- A Cloud Function de verdade, contra o emulador de Functions+Firestore: disparei manualmente via o endpoint HTTP que o emulador expõe pra funções agendadas (`POST .../sendRepDailyAgendaPush-0`), com um token falso cadastrado em um Rep de teste — a function rodou sem quebrar, contou certo "1 visita(s)" e **chamou de verdade** `admin.messaging().sendEachForMulticast()` (não é mockado nem emulado — o Admin SDK fala com o backend real do FCM mesmo em modo emulador local, só não existe um "emulador de Messaging"), que respondeu recusando o token falso — prova que o caminho de envio está de fato ligado ao FCM real, não é só "não travou"
- Fluxo de permissão no client: como o navegador automatizado desta sessão já vinha com `Notification.permission` fixado em `'denied'`, não dava pra testar o "conceder permissão" de verdade; simulei via `Object.defineProperty`/mock de `requestPermission()` para exercitar o caminho "permissão concedida → sem VAPID key configurada → mensagem de erro amigável, sem quebrar" — validado

**Lacuna conhecida, inerente ao que é testável neste ambiente:** entrega de push de verdade (o aparelho recebendo a notificação com o app fechado) exige um VAPID key real (Firebase Console → Cloud Messaging), um dispositivo físico e permissão concedida de verdade — nenhuma dessas três coisas existe neste ambiente de desenvolvimento. O código está pronto e o caminho de envio foi comprovadamente exercitado contra o FCM real (ponto acima), mas a entrega ponta-a-ponta em um device físico ainda precisa ser validada por alguém com acesso ao projeto Firebase de produção/homologação.

### Fase 5 — Performance, QA e go-live (Semana 6-7)
- [ ] Lighthouse mobile — LCP/TTI/bundle dentro do orçamento (§6.1)
- [ ] Testes em device real com rede 3G/4G simulada e real, incluindo os cenários de instabilidade da Fase 3
- [ ] Testes de layout em tablet real (iPad + Android) — §4.6
- [ ] Teste do fluxo de SSO (§3.3): token expirado, negação de permissão, navegação de volta
- [ ] Confirmar em DevTools que o Rep App e o CRM completo têm Application Storage (IndexedDB/Cache Storage) completamente separados por origem
- [ ] Firestore/Storage rules: confirmar que nada novo foi exposto além do que `rep` já podia acessar
- [ ] Checklist de QA mobile (reaproveitar formato de `QA/CHECKLIST_NOTAS_RICAS.md`)
- [ ] Deploy isolado: `firebase deploy --only hosting:rep-app` sem tocar no site do CRM completo

*(A Fase 5 ocupa duas semanas — QA de dispositivo real, tablet, rede instável e SSO juntos justificam a folga a mais, dado o padrão observado nos outros planos deste projeto.)*

---

## 10. Decisões do cliente (08/09/2026)

| # | Questão | Decisão | Onde impacta |
|---|---|---|---|
| 1 | Escopo de role | **Só `rep`** — SDR fica fora | `ProtectedRoute` do Rep App (Fase 0); agenda só considera `rep` |
| 2 | Domínio/instalação | **Site próprio, já criado pelo cliente: `wizmart-rep`** | §2.1 — target de Hosting aponta para o site existente |
| 3 | Identidade visual do ícone | **Variação do logo atual**, não uma marca nova | §5.1 — o `favicon.svg` do CRM completo acabou não sendo a marca real (era um placeholder genérico); os ícones foram recompostos a partir do mark real (`<Logo>`: carrinho+wifi em gradiente verde) |
| 4 | Push notification | **Entra no MVP** (deixa de ser opcional) | Fase 4 deixa de ser cortável — cronograma revisado em §9 |
| 5 | Visibilidade de cards | **Só os próprios** — na prática `participantIds array-contains uid`, não `responsibleId` (nota técnica em §3.1) | Confirma o desenho já previsto em §3.1 |
| 6 | Qualidade de rede em campo | **Considerar cenários de instabilidade real**, não só 4G estável | Fila offline (§7.2) ganha retry com backoff exponencial e teste de rede instável, não só "offline/online" binário |
| 7 | Tablet | **Sim, precisa funcionar bem em tablet** | Layout ganha breakpoint dedicado (§4.6) |
| 8 | Login entre Rep App e CRM completo | **Priorizar a melhor experiência** — sem pedir login de novo | Handoff de token (SSO) implementado — §3.3 |
| 9 | URL final | **`https://wizmart-rep.web.app`** | §2.1 |

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Fila de upload offline perder dados se o usuário desinstalar o app antes de sincronizar | Aviso explícito "Você tem N itens não enviados" antes de qualquer ação destrutiva (logout, fechar sem salvar) |
| Cópia da feature de Notas (§2.3) divergir do original ao longo do tempo | Trade-off assumido; se a divergência virar dor, extrair para pacote npm interno compartilhado — documentado como próximo passo, não como retrabalho |
| Push (Fase 4) atrasar o restante por complexidade de FCM/Service Worker | Mesmo sendo obrigatória no MVP (§10, item 4), continua isolada em sua própria fase — atraso ali não bloqueia o trabalho já concluído nas Fases 0-3 |
| Token de handoff do SSO (§3.3) vazar ou ser reaproveitado indevidamente | Custom token expira em 1h e é trocado em segundos; Cloud Function só emite para o próprio `request.auth.uid`, nunca aceita uid externo; `history.replaceState` remove o token da URL/histórico assim que o login é concluído |
| Retry de upload sobrecarregar o dispositivo/dados em rede instável (Fase 3) | Backoff exponencial com teto de tentativas; sonda de conectividade antes de cada tentativa evita gastar dados numa chamada fadada a falhar (§7.2) |
| Rep confundir "visita realizada" no PWA com uma transição de estágio que deveria ter mais contexto (ex. valor negociado) | Botão de check-in só cobre a transição simples já mapeada; qualquer estágio que exija dados adicionais mantém o link "Abrir no CRM completo" |
| Deploy do Rep App afetar acidentalmente o CRM completo | Projetos/pastas/`package.json` totalmente separados; `firebase deploy --only hosting:rep-app` nunca toca no target `crm` |

**Bug real encontrado pelo cliente (09/09/2026) — tela nativa "Toque no dinossauro" ao testar offline:** o `src/sw.ts` fazia o precache dos arquivos (`precacheAndRoute`) mas nunca registrava um **fallback de navegação**. `precacheAndRoute` só serve URL que bate exatamente com um arquivo do precache (`/`, `/manifest.json`, os `.js`/`.css` com hash) — rotas de cliente como `/agenda` ou `/card/deal-007` só existem via o rewrite do Firebase Hosting (`** -> /index.html`), que precisa de rede. Offline, sem fallback no Service Worker, a navegação para essas rotas falha e o Chrome mostra a tela nativa. Corrigido com `registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))` (workbox-routing) — qualquer navegação sem match exato agora serve o app shell do cache.

**Gotcha de metodologia de teste, relevante para quem for testar isso de novo:** o `vite-plugin-pwa` **não registra Service Worker em `npm run dev`** por padrão — só em `npm run build` seguido de `npm run preview` (ou o site publicado de verdade). Testar offline contra o servidor de desenvolvimento (`localhost:5180`) sempre vai mostrar a tela do dinossauro, com ou sem bug, porque não existe Service Worker nenhum rodando ali. Para testar comportamento offline: `npm run build && npm run preview`, ou o site deployado.

**Limitação encontrada na verificação (relevante para quem for automatizar testes disto):** o navegador automatizado usado nesta sessão não consegue registrar Service Worker nenhum — nem um trivial de uma linha, em qualquer escopo, testado isoladamente para isolar a causa. O erro genérico do Chrome (`An unknown error occurred when fetching the script`) é conhecido em contextos de automação com interceptação de rede via CDP (Chrome DevTools Protocol) ativa. A correção acima foi validada por build + análise estática (o build final inclui a rota de navegação corretamente, confirmado inspecionando o `dist/sw.js` gerado), mas **não pôde ser reconfirmada visualmente offline nesta sessão** — precisa ser testada de novo no dispositivo real onde o problema apareceu.

---

## 12. Métricas de sucesso

- Tempo até a agenda do dia aparecer na tela, com o app já instalado: **< 1s** (cache local do Firestore, sem esperar rede)
- % de notas registradas em campo que ficam pendentes de sincronização por mais de 1h: alvo **< 5%**
- Adoção: % de Reps que instalam o PWA na primeira semana após o lançamento
- Redução no tempo médio entre "visita realizada" e a nota aparecer no card, comparado ao fluxo atual (Rep anota no papel/WhatsApp e transcreve depois)

---

*Documento gerado em 08/09/2026 · Atualizado em 08/09/2026 (decisões do cliente, arquitetura de projeto separado) · WizMart CRM — PWA Representantes v1.1*
