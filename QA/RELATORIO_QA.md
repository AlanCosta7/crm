# WizMart CRM — Relatório de Auditoria de Qualidade

> 15/07/2026 · Auditoria completa de telas, interações e testes
> Gatilho: bug em produção — botão "Editar" do card sem ação alguma

## 1. Sumário executivo

| Indicador | Antes | Depois |
|---|---|---|
| Suíte de testes | 604 passando / **5 falhando** (meses) | **624/624 passando** ✅ |
| Botões/controles sem ação | **12** (incl. "Editar" do card) | **0** ativos (1 disabled+tooltip intencional) |
| Cobertura `src/utils` (lógica de negócio) | 94% stmts | **98,5% stmts · 100% funções · 99,7% linhas** |
| Cobertura global (incl. páginas) | ~76% | 77% stmts / 80% linhas |
| Scanner de controles mortos | não existia | `scripts/qa/qa-scan-dead-controls.mjs` (gate de deploy) |

## 2. Achados da varredura de interações — TODOS TRATADOS

| # | Tela | Achado | Severidade | Resolução |
|---|---|---|---|---|
| 1 | Card do lead | Botão "Editar" **sem handler** | 🔴 Alta | Edição inline implementada (nome/empresa/valor/vencimento) — **já em produção** |
| 2 | Card do lead | Ícone lápis ao lado do nome sem handler | 🔴 Alta | Abre a mesma edição |
| 3 | Settings › Empresa | "Salvar Alterações" **fingia salvar** (campos mock) | 🔴 Alta | Persistência real em `settings/general` + feedback Salvo/Erro |
| 4 | Contatos › detalhe | "Editar" sem handler | 🟡 Média | Modal reutilizado em modo edição (persiste de verdade) |
| 5 | Contatos › detalhe | "Novo Negócio" sem handler | 🟡 Média | Navega ao Pipeline |
| 6 | Contatos › detalhe | "Nova Atividade" sem handler e sem fluxo correspondente | 🟡 Média | Removido (atividades nascem no lead/cadência) |
| 7 | Contatos | "Filtrar" sem handler (busca+chips já cobrem) | 🟢 Baixa | Removido |
| 8 | Contatos | "Importar" sem handler | 🟢 Baixa | `disabled` + tooltip "em breve" (roadmap honesto) |
| 9 | Contatos | Paginação fake (Anterior/1/Próxima inertes) | 🟢 Baixa | Removida — lista única com contador |
| 10 | Pipeline | "Filtrar" sem handler | 🟢 Baixa | Removido (há filtro Favoritos + tabs de funil) |
| 11 | Projetos › modal | Área de upload "em breve" com cursor de clique | 🟢 Baixa | Cursor/opacidade de desabilitado |

## 3. Falhas de teste corrigidas (dívida antiga)

| Teste | Causa raiz | Correção |
|---|---|---|
| `useLeaderboard` ×4 | Callbacks do RTDB disparados fora de `act()` (React 19 não faz flush) | Disparos envolvidos em `act()` — o hook estava correto |
| `kpis` ×1 | Asserções de textos que não existem mais na tela ("Faturamento Conquistado", "Mapa de Vendas por Região") | Asserts alinhados à UI real |
| `contacts` ×5 (introduzidas na auditoria) | `useNavigate` novo sem Router no teste | Mock de react-router-dom |

## 4. Cobertura — estado e plano para 100%

**Política adotada:** lógica de negócio (`src/utils`, hooks) exige ~100%; páginas React priorizam testes de interação (handlers) sobre linhas de JSX.

| Área | Stmts | Situação |
|---|---|---|
| `src/utils` (16 módulos de regra de negócio) | **98,5%** (100% funções) | ✅ meta atingida — 15 testes novos (`qa-coverage-gaps.test.ts`) |
| `src/hooks` | 94,6% | ✅ saudável |
| Páginas com suíte própria (Cadência, Contatos, Dashboard, KPIs, Handoffs, Loja, Carteira, Leaderboard, Tasks, Activities, Companies, TV) | 60–94% | 🟡 cobrem estados + interações principais |
| Sem suíte dedicada: `DealSidebar` (a maior tela), `LeadPage`, `PipelinePage` (interações), `StandbyModal`, `CadenceConfigPage`, `BrazilMapSVG` (7%) | baixa | 🔴 **próxima onda** |

**Roadmap para 100% efetivo (estimativa 3–4 dias de esforço):**
1. `DealSidebar` — suite de interação (editar, ganhar/perder, standby, notas, registrar atividade, favoritar) — maior risco residual.
2. `PipelinePage` — drag/drop, gates de papel, criação BDR→fila.
3. `StandbyModal` + `CadenceConfigPage` + `LeadPage` — formulários e clamps.
4. `BrazilMapSVG` — snapshot com dados fixos.
5. Ativar `coverage.thresholds` no vitest.config (utils: 98/100) para travar regressão.

## 5. Validações de campos auditadas (amostra executada)

| Formulário | Regras confirmadas |
|---|---|
| Handoff | 4 campos obrigatórios, data futura, erro por campo + banner de falha de servidor |
| Standby | mín. 5 follow-ups, gap ≤7 dias (clamp automático), preview de datas |
| Novo Negócio | nome+empresa obrigatórios; BDR → fila com toast |
| Contato (novo/editar) | nome+empresa obrigatórios; e-mail/telefone livres (⚠️ sugerido: máscara/validação de formato — backlog) |
| Config. Cadência | clamps 0–10 / 0–7 / 1–15 aplicados no cliente E no servidor (`normalizeCadenceConfig`) |
| Empresa (Settings) | nome obrigatório; grava com merge e feedback |

## 6. Pendências conhecidas (fora do escopo desta auditoria)

1. **`onDealWon` — KPIs da TV não incrementam** (erro de API de increment no RTDB) — task separada já em andamento em outra sessão.
2. **Playwright E2E** não rodou: portas 5001/9000 ocupadas por emuladores de outros projetos na máquina — rodar `npm run test:e2e:local` com portas livres.
3. **Deploy**: correções desta auditoria (itens 3–11 da tabela) ainda **não deployadas**; item 1–2 (Editar do card) já está em produção. Migração do `onDealStageChanged` (us-central1→southamerica) segue aguardando os 2 comandos do Alan.
4. **2 dúvidas do cliente** travam os itens 2.7 (vencimento do card) e 4.5 (descarte "cliente já...") do plano de ajustes.
5. Sugerido para o backlog: validação de formato de e-mail/telefone nos formulários de contato e convite; máscara de CNPJ na pane Empresa.

## 7. Como manter (processo)

- **Gate de deploy** = seção 4 do [PLANO_DE_TESTES.md](PLANO_DE_TESTES.md): suíte verde + scanner zero + emulador verde + builds.
- Todo botão novo nasce com handler ou `disabled`+tooltip — o scanner pega violações.
- Toda regra de negócio nova nasce em `src/utils` com teste (padrão já praticado nas Fases 2–4).
