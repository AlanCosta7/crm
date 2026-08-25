# API de Captação de Leads (WizMart Forms) — Referência Técnica

Referência técnica completa do endpoint público usado pelo [Guia de Captação de Leads](WizMart-Guia-Captacao-Leads.html) (`docs/WizMart-Guia-Captacao-Leads.html`). Destinado a quem vai integrar via HTTP direto (Opção B do guia) em vez do snippet `wizforms.js`.

## Endpoint

```
POST https://wizmart-crm.web.app/api/leads
```

## Autenticação

Cada **fonte de captação** (cadastrada em Configurações → Captação de Leads no CRM) tem uma chave própria, no formato `wzk_` + 43 caracteres. Envie no header:

```
X-WizMart-Key: wzk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A chave é exibida **uma única vez** no momento da criação da fonte — o servidor guarda apenas um hash dela, não o valor em claro. Se for perdida, gere uma nova pela UI (rotação de chave); a antiga para de funcionar imediatamente.

## Restrição de origem (CORS)

A requisição precisa ser originada de um domínio presente na lista **"Domínios permitidos"** da fonte. O servidor confere o header `Origin` (ou, na ausência dele, o `Referer`). Domínios fora da lista recebem `403`.

Domínios cadastrados sem esquema assumem `https://`. É possível liberar qualquer subdomínio com wildcard: `https://*.dominio.com.br`.

## Corpo da requisição

`Content-Type: application/json`, tamanho máximo **16 KB**.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string (2–120 chars) | ✅ | Nome do lead |
| `email` | string (email válido, até 160 chars) | ⚠️ e-mail **ou** telefone | E-mail do lead |
| `phone` | string (até 30 chars) | ⚠️ e-mail **ou** telefone | Telefone — aceita qualquer formatação BR comum; o servidor normaliza (remove símbolos, DDI 55, zero de operadora) |
| `company` | string (até 160 chars) | não | Empresa do lead |
| `message` | string (até 2000 chars) | não | Mensagem livre |
| `custom` | objeto `{ [chave]: string }` | não | Até 10 campos extras (chave ≤ 40 chars, valor ≤ 500 chars). Qualquer campo do formulário HTML que não seja um dos conhecidos acima cai aqui automaticamente quando usado com o snippet `wizforms.js` |
| `tracking` | objeto | não | Ver abaixo |
| `tracking.utmSource` / `utmMedium` / `utmCampaign` / `utmTerm` / `utmContent` | string (até 500 chars) | não | Parâmetros UTM da URL de origem |
| `tracking.pageUrl` | string (até 500 chars) | não | URL completa da página onde o formulário foi preenchido |
| `tracking.referrer` | string (até 500 chars) | não | `document.referrer` do navegador |

`email` ou `phone` — **pelo menos um dos dois** precisa ser um valor válido; caso contrário a requisição é rejeitada com `400`.

### Campos de controle (usados pelo snippet `wizforms.js`, opcionais em integração direta)

| Campo | Tipo | Descrição |
|---|---|---|
| `_hp` | string | Campo honeypot — deve chegar **vazio**. Se vier preenchido, a requisição é tratada como bot (resposta de sucesso falso, nada é gravado) |
| `_ts` | number (epoch ms) | Timestamp de quando o formulário foi renderizado. Se o envio ocorrer em menos de 3s após esse timestamp, é tratado como bot. Se ausente, esta verificação é pulada (útil em integrações 100% server-side, que não têm "renderização") |
| `_turnstile` | string | Token do widget Cloudflare Turnstile, obrigatório apenas se a fonte tiver a verificação anti-robô ativada |

### Exemplo completo

```json
{
  "name": "Maria Silva",
  "email": "maria@empresa.com.br",
  "phone": "(11) 98765-4321",
  "company": "Mercado Bom Preço",
  "message": "Quero saber mais sobre o Smart Café",
  "custom": { "cidade": "Campinas" },
  "tracking": {
    "utmSource": "google",
    "utmMedium": "cpc",
    "utmCampaign": "lancamento_julho",
    "pageUrl": "https://wizmart.com.br/landing?utm_source=google"
  }
}
```

## Respostas

| Status | Corpo | Situação |
|---|---|---|
| `201` | `{ "ok": true, "leadId": "..." }` | Lead recebido. **Atenção:** bloqueios anti-bot (honeypot preenchido, envio rápido demais) também respondem `201` com um `leadId` falso — de propósito, para não ensinar bots a driblar a proteção. Nenhum dado é gravado nesses casos |
| `400` | `{ "error": "invalid_request", "details": [...] }` | Payload inválido (falta `name`, nem `email` nem `phone` válidos, campo acima do limite, etc.) |
| `400` | `{ "error": "turnstile_failed" }` | Fonte exige Turnstile e o token não foi validado |
| `401` | `{ "error": "invalid_key" }` | Chave ausente, mal formatada, inexistente **ou fonte desativada** (mesma resposta nos dois casos, de propósito) |
| `403` | `{ "error": "origin_not_allowed" }` | Domínio de origem fora da lista de permitidos da fonte |
| `405` | `{ "error": "method_not_allowed" }` | Método diferente de `POST`/`OPTIONS` |
| `413` | `{ "error": "payload_too_large" }` | Corpo acima de 16 KB |
| `429` | `{ "error": "too_many_requests" }` | Limite de envios excedido (ver Limites abaixo) |
| `500` | `{ "error": "internal" }` | Erro interno — raro; tentar novamente |

## Limites (rate limiting)

| Escopo | Limite |
|---|---|
| Por IP de origem | 5 requisições / minuto |
| Por fonte (todas as origens somadas) | 60 requisições / hora |

Ambos os limites usam janela deslizante. Requisições bloqueadas por rate limit também contam para o limite (não adianta insistir em sequência).

## Deduplicação

Leads com o mesmo e-mail (ou, na ausência de e-mail, o mesmo telefone normalizado) enviados para a **mesma fonte** dentro de **24 horas** não criam um novo card — o sistema registra uma atividade no card já existente. O e-mail tem prioridade sobre o telefone na identificação de duplicidade.

## Onde o lead aparece no CRM

O lead vira um card (`Deal`) no **primeiro estágio** do funil configurado na fonte, com:

- Responsável = o "Responsável" definido na fonte (ou fila para os gestores, se não definido)
- Badge de origem com o nome da fonte e os UTMs capturados
- Notificação in-app para o responsável (ou para masters/managers, na ausência de um responsável fixo)

## Boas práticas

- Prefira o snippet `wizforms.js` (Opção A do guia) sempre que possível — ele já cuida de honeypot, timestamp, UTMs e mensagens de erro/sucesso.
- Nunca reutilize a mesma chave em sites de domínios diferentes — crie uma fonte por site/campanha.
- Não exponha a chave em repositórios de código público além do necessário para o funcionamento do site; ela só permite criar leads na fonte associada, mas ainda assim deve ser tratada como um segredo de baixo risco.
- Trate erros `4xx` mostrando uma mensagem genérica ao usuário final — não exponha os detalhes de `details` na interface pública.
