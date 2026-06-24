# WizMart CRM — Guia de Desenvolvimento

> Stack: React 19 + Vite + TypeScript + Tailwind + Firebase  
> Versão do plano: v2 (REQUISITOS-V2.md)  
> Diretório: `/Users/alancosta/Frella/CRM/wizmart-crm/`

---

## 1. Visão Geral do Projeto

CRM SaaS B2B para times comerciais do setor de varejo/distribuição (WizMart e Smart Café).

**Produtos suportados:**
- `wizmart` — Varejo e Distribuição (verde `#1A6B1A` / lima `#8DB600`)
- `smart_cafe` — Café e Bebidas (marrom `#92400E` / âmbar `#D97706`)

**Roles RBAC (6):**

| Role | Descrição |
|---|---|
| `master` | Admin total — configura tudo, vê tudo |
| `manager` | Gestor comercial — KPIs completos, configura cadência |
| `bdr` | Gera leads e distribui para fila SDR |
| `sdr` | Executa cadência diária, faz handoff |
| `rep` | Recebe handoffs, fecha negócios |
| `viewer` | Somente leitura |

---

## 2. Comandos Úteis

```bash
# Iniciar emuladores Firebase
firebase emulators:start --only auth,firestore,database,functions

# Popular emuladores com dados de teste (6 roles + 2 produtos)
node scripts/seed-emulators.mjs

# Dev server (Node 22 obrigatório)
nvm use 22 && npm run dev

# Build de produção
nvm use 22 && npm run build

# Testes (Vitest)
npm run test          # watch mode
npm run test -- --run # uma vez

# Deploy Firebase Hosting
firebase deploy --only hosting
```

**Contas de teste (senha: `senha_de_teste_123`):**
```
master@wizmart.com.br   — Admin Master
manager@wizmart.com.br  — Gestor
bdr@wizmart.com.br      — BDR
sdr@wizmart.com.br      — SDR
rep@wizmart.com.br      — Representante
viewer@wizmart.com.br   — Visualizador
```

---

## 3. Estrutura de Pastas

```
src/
├── config/         # Firebase init (firebase.ts)
├── types/          # crm.ts — todos os tipos TypeScript v2
├── stores/         # Zustand: authStore, uiStore
├── hooks/          # useFirestore, useLeaderboard, useLiveKPIs
├── utils/          # crmFormat.ts — utilitários puros + testados
├── components/
│   ├── layout/     # Shell, Sidebar, Topbar
│   └── ui/         # Logo, Icon, Av (Avatar)
└── features/
    ├── auth/           # LoginPage, ProtectedRoute, useAuth
    ├── dashboard/      # DashboardPage (adaptativo por role)
    ├── pipeline/       # PipelinePage (Kanban + Lista)
    ├── contacts/       # ContactsPage (multi-produto)
    ├── companies/      # CompaniesPage
    ├── activities/     # ActivitiesPage
    ├── tasks/          # TasksPage (tarefas gamificadas v1)
    ├── cadencia/       # CadenciaPage — SDR [Fase 4]
    ├── handoffs/       # HandoffsPage — Rep [Fase 5]
    ├── gamification/   # LeaderboardPage, streakUtils
    ├── kpis/           # KPIsPage
    ├── carteira/       # CarteiraPage — Moedas [Fase 7]
    ├── loja/           # LojaPage — Prêmios [Fase 7]
    ├── settings/       # SettingsPage (admin)
    └── tv/             # TVPage (rota pública /tv/:token)
```

---

## 4. Convenções de Código

### TypeScript
- Tipos centralizados em `src/types/crm.ts` — nunca duplicar em outros arquivos
- `UserRole` e `ProductId` importados de `types/crm`
- `any` só em adaptadores de dados externos (Firestore timestamps, legado)
- Preferir `??` ao invés de `||` para valores falsíeis não-booleanos

### Componentes
- Componentes grandes devem ter JSDoc no topo explicando o propósito
- Componentes com lógica de role devem ter comentário `// master/manager → ...`
- `useEffect` com `anime` deve ter a dependência correta no array

### Stores
- `authStore`: nunca modificar diretamente — usar `setUser()` e `setLoading()`
- `uiStore`: `productId` persiste no localStorage com chave `wm_product`
- Ao adicionar campo no `UserState`, atualizar também o `useAuth.ts`

### Firebase
- Toda escrita deve passar por `useFirestoreMutations`
- `addDocument` adiciona `createdAt` e `updatedAt` automaticamente
- Campos que só Cloud Functions podem escrever devem ter `allow write: if false` nas rules
- Nunca fazer query sem o `tenantId` no path

### Testes
- Arquivos de teste: `*.test.ts` ou `*.test.tsx`
- Mock de Firebase via `vi.mock('../../hooks/useFirestore', ...)`
- Mock de stores via `vi.mock('../../stores/authStore', ...)`
- Lógica pura (filtros, cálculos) deve ter testes sem mocks
- Rodar `npm run test -- --run` antes de todo commit

---

## 5. Modelo de Dados — Resumo

### Firestore: `/tenants/{tenantId}/`

| Coleção | Escrita | Leitura |
|---|---|---|
| `deals` | bdr/sdr/rep (via permissões) | todos |
| `funnels` | manager/master | todos |
| `contacts` | operacional (não viewer) | todos |
| `activities` | Cloud Functions | todos |
| `handoffs` | sdr (create), CF (update) | operacional |
| `cadence_queues` | Cloud Functions | sdr/manager/master |
| `coin_ledger` | Cloud Functions | todos |
| `prizes` | manager/master | todos |
| `templates` | manager/master | operacional |
| `calendar_tokens` | Cloud Functions HTTP | owner/master |
| `kpi_snapshots` | Cloud Functions | todos |
| `settings` | master | master |

### Realtime Database

| Path | Uso |
|---|---|
| `/tenants/{id}/leaderboard` | Ranking ao vivo (WebSocket) |
| `/tenants/{id}/live_kpis` | KPIs em tempo real |
| `/public_tv/{token}` | TV Display público (sem auth) |

---

## 6. Fases de Desenvolvimento

| Fase | Semanas | Status | O que entrega |
|---|---|---|---|
| **1 — Fundação v2** | 1–2 | ✅ Completo | 6 roles, seletor de produto, sidebar adaptativa, types v2, seed v2 |
| **2 — CRM Core v2** | 3–4 | ✅ Completo | Dashboard por role, contatos multi-produto, filtros, testes |
| **3 — Multi-Funil** | 5–6 | ✅ Completo | 3 funis dinâmicos, convergência, handoff form, templates |
| **4 — Cadência SDR** | 7–8 | ✅ Completo | Tela de cadência, dailyCadenceEngine cron, fila BDR |
| **5 — Handoff Rep** | 9–10 | ✅ Completo | Fluxo Rep, modal próxima ação, repSlaChecker |
| **6 — Google Calendar** | 11–12 | ✅ Completo | OAuth2, eventos automáticos |
| **7 — Moedas + Loja** | 13–14 | ✅ Completo | Ledger, loja, resgates, ciclo trimestral |
| **8 — KPI Dashboards** | 15–16 | ✅ Completo | KPI por role, funil de conversão, mapa de visitas, snapshots horários e TV |
| **9 — Gamificação v2** | 17–18 | ✅ Completo | Badges v2, leaderboard por produto, PWA push, conquistas |
| **10 — QA + Deploy** | 19–20 | ✅ Completo | E2E Playwright, security rules, deploy local e testes |
| **11 — Perfis Dinâmicos** | — | ✅ Completo | RBAC flexível nas configurações, hook de permissões, roteador reativo |
| **12 — Multi-Produto** | — | ✅ Completo | Topbar switcher universal, cadência diária segmentada por produto |

---

## 7. Variáveis de Ambiente

Arquivo `.env.local` (não commitar):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=...
```

Para emuladores locais, adicionar também:
```env
VITE_USE_EMULATORS=true
```

---

## 8. Cloud Functions — Mapa

### Implementadas
| Função | Trigger / Tipo | Propósito |
|---|---|---|
| `onDealCreate` | Firestore onCreate `/deals/{id}` | Registra início do lead e aciona auditorias |
| `onTaskComplete` | Firestore onUpdate `/deals/{id}` | Concede pontos e moedas ao fechar tarefas |
| `onDealWon` | Firestore onUpdate `/deals/{id}` | Distribui moedas de faturamento/PDV |
| `onTokenChange` | Firestore onWrite `/settings/tv` | Sincroniza configurações e permissões da TV |
| `syncMoskit` | HTTP Callable | Importação em lote via Cloud Tasks (adiada/mock) |
| `onDealStageChanged` | Firestore onUpdate `/deals/{id}` | Dispara convergência do lead para funil Hunter |
| `dailyCadenceEngine` | Cron (PubSub) 7h BRT | Distribuição diária de novos cards e fechamento da fila |
| `acceptHandoff` | HTTP Callable | Aceita passagem de bastão de SDR e move para pipeline do Rep |
| `declineHandoff` | HTTP Callable | Recusa passagem de bastão de SDR informando motivo |
| `repSlaChecker` | Cron (PubSub) 8h BRT | Monitora o prazo de 3 dias úteis para primeiro contato do Rep |
| `activityOverdueChecker` | Cron (PubSub) a cada 2h | Verifica atividades em atraso e notifica SDR/Rep via WhatsApp |
| `onCoinTransactionCreated` | Firestore onCreate `/coin_ledger` | Atualiza o cache do saldo em `users/{uid}.coinBalance` |
| `redeemCoins` | HTTP Callable | Registra resgate de prêmio na loja e deduz moedas do ledger |
| `onActivityCompleted` | Firestore onUpdate `/activities` | Libera moedas baseadas no prazo de execução da cadência |
| `calendarOAuthStart` | HTTP GET `/calendar/auth` | Inicia o fluxo OAuth2 para sincronização com Google Agenda |
| `calendarOAuthCallback`| HTTP GET `/calendar/callback`| Recebe código de autorização e grava tokens criptografados |
| `onActivityScheduled` | Firestore onWrite `/activities` | Cria, atualiza ou deleta eventos na Google Agenda do vendedor |
| `syncCalendarEvent` | HTTP Callable | Força sincronização manual de atividades |
| `disconnectCalendar` | HTTP Callable | Remove os tokens e desvincula a conta do Google Agenda |
| `kpiAggregator` | Cron (PubSub) Horário | Consolida relatórios e salva snapshots na coleção `/kpi_snapshots` |
| `tvDataRefresher` | Cron (PubSub) 5min | Consolida dados de liderança e geolocalização para as TVs |

---

## 9. Cobertura de Testes

| Arquivo de teste | O que testa |
|---|---|
| `streak.test.ts` | Cálculo de streak com timezone (7 casos) |
| `tv-security.test.tsx` | Ocultação de dados financeiros confidenciais na TV |
| `crmFormat.test.ts` | Formatação, lookups, permissões por role, fórmula cadência |
| `contacts.filter.test.ts` | Filtros multi-produto, busca, chips |
| `stores.test.ts` | authStore (6 roles) + uiStore (productId, sidebar) |
| `dashboard.test.tsx` | Seleção de painel por role (9 casos) |
| `funnelUtils.test.ts` | Convergência, handoff, validação form, SLA, roles, templates (46 casos) |
| `cadenceUtils.test.ts` | Fórmula de cards, taxa de conclusão, data BRT, cenários completos (22 casos) |
| `cadencia.test.tsx` | CadenciaPage por estado (loading/vazio/cards), interação, métricas (18 casos) |
| `handoffUtils.test.ts` | addBusinessDays, SLA, validateNextActionForm, permissões (26 casos) |
| `handoffs.test.tsx` | HandoffsPage tabs, filtros por role, modal de recusa, badge (13 casos) |
| `calendarUtils.test.ts` | Configuração de eventos, title/desc, duração, token, buildEvent (40 casos) |
| `coinUtils.test.ts` | Ciclos, saldo, formatação, validação resgate, tabela premiação, PDV (54 casos) |
| `carteira.test.tsx` | CarteiraPage saldo, filtros, estado vazio, loading (8 casos) |
| `loja.test.tsx` | LojaPage grid, filtros, estados de botão, modal de resgate (14 casos) |
| `kpiUtils.test.ts` | Agregações de KPI, taxas de conversão, dados de mapa regional (24 casos) |
| `kpis.test.tsx` | KPIsPage abas, gráficos, filtros por produto e vendedor, mapa SVG (12 casos) |
| `leaderboard.test.tsx` | LeaderboardPage pódio, ranking do time, abas de conquistas e filtros (14 casos) |
| `tasks.test.tsx` | TasksPage lista, filtros de tarefas, conclusão manual e recompensas (8 casos) |
| `activities.test.tsx`| ActivitiesPage timeline, filtros de canais e histórico de contatos (10 casos) |
| `contacts.test.tsx` | ContactsPage listagem de clientes, criação de contato, multi-produto (12 casos) |
| `companies.test.tsx` | CompaniesPage lista de empresas, fallbacks numéricos para dados incompletos (8 casos) |
| `productScope.test.ts`| allowedProductIds, matchesProductId, matchesProductIds e permissões (18 casos) |

**Executar todos:** `npm run test -- --run`

---

## 10. Decisões Arquiteturais (ADRs)

Documentadas em `DESENVOLVIMENTO.md` (ADR-001 a ADR-005) e `REQUISITOS-V2.md` (ADR-006 a ADR-012).

**Resumo rápido:**
- SPA React + Vite no Firebase Hosting (sem SSR)
- Firestore como BD principal (multi-tenant `/tenants/{id}/`)
- Realtime Database apenas para TV Display e leaderboard ao vivo (<100ms)
- Cloud Functions Gen 2 para toda lógica server-side
- Estágios de funil totalmente dinâmicos (sem hardcode)
- Moedas como ledger append-only (event sourcing light)
- WhatsApp via `whatsapp-web.js` + Cloud Run (notificações internas de atraso)
- Google Calendar via OAuth2 server-side em Cloud Functions HTTP
