# Plano — Ações com Registro Automático no Card (Email, WhatsApp, Reunião)

> Objetivo: o usuário executa **enviar email**, **mandar WhatsApp** e **agendar reunião**
> de dentro do CRM, em um modal por ação, e a atividade é **registrada automaticamente
> no card do negócio** — sem precisar registrar manualmente depois.
>
> Abordagem escolhida: **Híbrida, 100% gratuita**
> - **Reunião** → sincronização real via Google Calendar (backend já existe).
> - **Email** → envio real e **gratuito via Gmail API**, reaproveitando o OAuth do Google já usado no Calendar (escopo `gmail.send`). O email sai da conta Gmail do próprio usuário (~500 envios/dia grátis, aparece em "Enviados"). **Sem SendGrid.**
> - **WhatsApp** → deep-link `wa.me` com mensagem pré-preenchida na Fase 1; API oficial fica para fase futura.

---

## 1. Situação atual (o que já existe)

| Peça | Status | Onde |
|------|--------|------|
| Modelo `Activity` (email/whatsapp/meeting, status, completedAt, templateId, calendarEventId, outcome, coins) | ✅ Pronto | `src/types/crm.ts:178` |
| `PlaybookTemplate` (subject, body, variables) | ✅ Modelo pronto | `src/types/crm.ts:260` |
| Cloud Function `onActivityScheduled` — cria/atualiza/deleta evento no Google Calendar quando uma activity com `scheduledAt` é gravada | ✅ Pronto | `functions/src/integrations/calendar/onActivityScheduled.ts` |
| OAuth Google Calendar (start/callback) + `calendar_tokens` | ✅ Pronto | `functions/src/integrations/calendar/` |
| Contato com `email`, `phone`, `whatsappNumber` | ✅ Pronto | `src/types/crm.ts:31` |
| Coleção `activities` lida por KPIs/Dashboard/gamificação | ✅ Pronto | vários |
| Botão "Registrar" no card | ⚠️ Só vira flag `tasks.e/w/m` + dá pontos; **não grava Activity nem envia nada** | `src/features/deals/DealSidebar.tsx:147` |
| Aba "Atividades" do card | ⚠️ Mostra **dados mockados**, não a coleção real | `src/features/deals/DealSidebar.tsx:481` |
| Backend de envio de email | ❌ Não existe — será via **Gmail API** reaproveitando o OAuth do Calendar (`SCOPES` em `functions/.../calendar/calendarService.ts:19`) | — |
| Integração WhatsApp | ❌ Não existe | — |

**Conclusão:** a base de dados e o motor de calendário já existem. O trabalho é (a) trocar
o "registrar flag" por modais que gravam `Activity` real, (b) ligar a aba de Atividades
à coleção real, (c) adicionar envio de email no backend.

---

## 2. Requisitos

### 2.1 Requisitos funcionais

**RF-01 — Modal de Email**
- Selecionar destinatário a partir dos contatos do negócio (default: contato principal / decisor).
- Escolher um `PlaybookTemplate` (filtrado por `activityType='email'`, funil, estágio, produto) ou escrever livremente.
- Renderizar variáveis do template (`{{contato}}`, `{{empresa}}`, `{{vendedor}}`, etc.) com dados do deal/contato.
- Campos: destinatário, assunto, corpo (rich text simples).
- Ação "Enviar" → backend SendGrid envia o email.
- Ao enviar com sucesso → grava `Activity {type:'email', status:'completed', completedAt}` no card automaticamente.

**RF-02 — Modal de WhatsApp**
- Selecionar destinatário (usa `whatsappNumber` ou `phone` do contato).
- Escolher template (`activityType='whatsapp'`) ou texto livre, com variáveis renderizadas.
- Ação "Abrir no WhatsApp" → abre `https://wa.me/<numero>?text=<mensagem>` em nova aba.
- No mesmo clique → grava `Activity {type:'whatsapp', status:'completed', completedAt}` automaticamente
  (registro independe da confirmação de entrega, já que o envio final ocorre no WhatsApp).

**RF-03 — Modal de Reunião**
- Campos: título (auto-sugerido pelo nome do deal), data/hora, duração, tipo (`presential`/`video`), participantes, notas.
- Ação "Agendar" → grava `Activity {type:'meeting', scheduledAt, dueAt, status:'pending'}`.
- A Cloud Function `onActivityScheduled` cria o evento no Google Calendar automaticamente e
  preenche `calendarEventId`/`calendarSyncedAt` (já implementado).
- Se o usuário não tiver Calendar conectado → ainda registra a atividade no card e exibe CTA "Conectar Google Calendar".

**RF-04 — Registro automático no card**
- Toda ação acima grava na coleção `tenants/{tenantId}/activities` com `dealId`, `userId`, `productId`, `type`, `status`, timestamps.
- Atualiza a flag legada `tasks.e/w/m` correspondente (compatibilidade com o card atual).
- Dispara a premiação de moedas existente (`coinsAwarded`) e o toast de pontos (`onPoints`).

**RF-05 — Aba "Atividades" real**
- Substituir o mock por leitura da coleção `activities` filtrada por `dealId`, ordenada por data desc.
- Ícone/cor por tipo (email, whatsapp, meeting, etc.) e status (enviado, agendado, concluído).

**RF-06 — Templates (reuso do modelo existente)**
- Tela de gestão de templates em Configurações (CRUD de `PlaybookTemplate`) — se ainda não existir UI completa, criar.
- Incrementar `usageCount` ao usar um template.

### 2.2 Requisitos não-funcionais
- **RNF-01** Segurança: chaves de API (SendGrid) **apenas no backend** (Functions config/Secrets), nunca no front.
- **RNF-02** Multi-tenant: todas as gravações sob `tenants/{tenantId}/...`; regras do Firestore restringindo por tenant/role.
- **RNF-03** Permissões: respeitar `usePermissions` — quem pode mover/editar deal pode registrar atividade.
- **RNF-04** Idempotência: evitar duplo registro em duplo clique (desabilitar botão durante o submit).
- **RNF-05** Telemetria mínima: logar falhas de envio (email/calendar) sem quebrar o registro da atividade.
- **RNF-06** Acessibilidade: foco no primeiro campo, fechar no ESC, labels nos inputs.

---

## 3. Arquitetura / fluxos

### Email (envio real e gratuito — Gmail API)
```
Modal Email → Cloud Function callable `sendEmail`
            → usa o token OAuth do usuário em calendar_tokens/{userId}
              (mesmo OAuth do Calendar, escopo gmail.send adicionado)
            → Gmail API envia da conta do próprio usuário
            → callable grava Activity {type:email, status:completed}
            → card atualiza (listener da coleção) + toast de moedas
```
> Observação: os tokens já ficam em `tenants/{tenantId}/calendar_tokens/{userId}`.
> Basta adicionar `https://www.googleapis.com/auth/gmail.send` ao array `SCOPES`
> e reconsentir uma vez. Nenhuma conta/serviço externo, nenhuma chave de API paga.

### WhatsApp (deep-link Fase 1)
```
Modal WhatsApp → window.open(wa.me/<num>?text=...)
              → front grava Activity {type:whatsapp, status:completed}
              → card atualiza + toast
```

### Reunião (Google Calendar — já existe)
```
Modal Reunião → grava Activity {type:meeting, scheduledAt}
             → trigger onActivityScheduled cria evento no Calendar
             → calendarEventId salvo na activity
             → card atualiza + toast
```

---

## 4. Componentes a criar / alterar

**Novos componentes (front)**
- `src/features/deals/actions/EmailActionModal.tsx`
- `src/features/deals/actions/WhatsAppActionModal.tsx`
- `src/features/deals/actions/MeetingActionModal.tsx`
- `src/features/deals/actions/useLogActivity.ts` — hook que grava `Activity`, atualiza `tasks`, dispara `onPoints` (lógica compartilhada pelos 3 modais).
- `src/utils/templateRender.ts` — substitui variáveis `{{...}}` do template com dados do deal/contato.

**Alterações**
- `DealSidebar.tsx` — trocar os botões "Registrar" (`registrarTarefa`) por abrir os 3 modais; ligar a aba "Atividades" à coleção real.
- `src/utils/calendarUtils.ts` — já tem `buildEventSummary/Description`; reaproveitar no modal de reunião.

**Backend (Functions) — Fase 2**
- `functions/src/integrations/email/sendEmail.ts` — callable: valida, renderiza, envia via **Gmail API** (lib `googleapis` já usada no Calendar), grava Activity.
- Adicionar escopo `https://www.googleapis.com/auth/gmail.send` ao `SCOPES` em `calendarService.ts:19` (reconsentimento único do usuário).
- Sem secrets pagos — usa o `GOOGLE_CLIENT_ID/SECRET` do OAuth já configurado.

---

## 5. Modelo de dados (campos usados por ação)

```ts
// Activity gravada por cada modal
{
  dealId, contactId, userId, productId,
  type: 'email' | 'whatsapp' | 'meeting',
  status: 'completed' (email/whatsapp) | 'pending' (meeting),
  templateId?, templateUsed?,
  completedAt? (email/whatsapp),
  scheduledAt?, dueAt? (meeting),
  outcome?,                      // resumo livre
  coinsAwarded, createdAt,
  // espelho legado p/ card atual:
  // + updateDoc(deal).tasks.{e|w|m} = true
}
```

---

## 6. Faseamento

### Fase 1 — MVP sem dependências externas (entrega rápida)
1. `useLogActivity` + `templateRender`.
2. `MeetingActionModal` (usa Calendar já pronto).
3. `WhatsAppActionModal` (deep-link wa.me).
4. `EmailActionModal` em **modo `mailto:`** provisório (abre cliente de email) + registro automático.
5. Aba "Atividades" real no card.
6. Integrar os 3 modais ao `DealSidebar` substituindo os botões atuais.

### Fase 2 — Envio real de email (Gmail API, gratuito)
7. Adicionar escopo `gmail.send` ao OAuth do Google (reusa o fluxo do Calendar) + reconsentimento.
8. Callable `sendEmail` usando Gmail API com o token do usuário.
9. Trocar o `mailto:` do `EmailActionModal` pelo envio via backend, com status de envio.
10. CRUD de templates em Configurações (se faltar).

### Fase 3 — WhatsApp API oficial (futuro, sob demanda)
10. Integração Meta/Twilio, aprovação de templates, status entregue/lido.

---

## 7. Decisões pendentes / dependências do cliente
- **Email = Gmail API (gratuito)**: já decidido. Reusa o OAuth do Google do Calendar; só adiciona o escopo `gmail.send` e exige um reconsentimento do usuário. Sem custo, sem serviço externo. Limite prático: ~500 emails/dia por conta Gmail comum (2.000/dia no Workspace).
- **Google (Calendar + Gmail)** (Fase 1/2): cada usuário conecta a conta Google uma vez (OAuth já implementado, escopo de email somado).
- **WhatsApp API** (Fase 3): conta Meta Business / Twilio + aprovação de templates (custo por conversa) — só se o cliente quiser envio sem deep-link.

---

## 8. Critérios de aceite
- [ ] Ao enviar email/WhatsApp ou agendar reunião pelo card, aparece **automaticamente** um registro na aba Atividades, sem ação manual extra.
- [ ] Reunião agendada cria evento no Google Calendar do usuário (quando conectado).
- [ ] WhatsApp abre o app/web com número e mensagem pré-preenchidos.
- [ ] Email é enviado (Fase 2) e o status reflete sucesso/erro.
- [ ] Pontos/moedas e flags `tasks` continuam funcionando.
- [ ] Nenhuma chave de API exposta no front.
