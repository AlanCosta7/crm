# WizMart CRM — Plano de Testes (QA Sênior)

> Versão 1.0 · 15/07/2026 · Cobertura: todas as telas e interações do app
> Executar antes de todo deploy: `npm run test -- --run` (unitários) + scripts de emulador (integração) + Playwright (E2E, quando portas livres)

## 1. Escopo e estratégia

| Camada | Ferramenta | O que valida | Comando |
|---|---|---|---|
| Unitária | Vitest + Testing Library | Lógica pura, componentes, handlers | `npm run test -- --run` |
| Integração (rules + CFs reais) | Emulador Firebase | Permissões, fluxos servidor | `npx firebase emulators:exec --config firebase.emutest.json --only auth,firestore,functions,database --project demo-wizmart "node scripts/<script>.mjs"` |
| E2E navegador | Playwright | Fluxos completos por papel | `npm run test:e2e:local` (exige portas 5001/9000 livres) |
| Estática | Scanner próprio | Botões/controles sem ação | `node scripts/qa-scan-dead-controls.mjs` |

**Papéis de teste:** master, manager, bdr, sdr, rep, viewer, design — cada tela deve ser validada com o papel mais restrito que a acessa.

**Regra de ouro (política de qualidade):** nenhum controle visível pode estar sem ação. Funcionalidade futura = botão `disabled` com tooltip "em breve". O scanner estático falha o QA se encontrar botão ativo sem handler.

## 2. Matriz de testes por tela

### 2.1 Login (`/login`)
| Item | Validação | Critério de aceite |
|---|---|---|
| E-mail | obrigatório, formato e-mail | erro visível em campo inválido |
| Senha | obrigatória | erro do Firebase exibido em PT-BR |
| Botão Entrar | desabilita durante submit | redireciona ao dashboard do papel |

### 2.2 Dashboard (`/`) — adaptativo por papel
| Painel | Ações | Critério |
|---|---|---|
| Gestão | filtros produto/período, mapa de visitas, funil de leads | todos os widgets respondem aos filtros |
| SDR | card "Atividades do Dia" → `/activities`; "Ver Cadência" → `/cadencia`; alerta de agenda → `/activities` | navegações corretas; % bate com atividades reais |
| BDR | "Novo Lead" → `/pipeline`; monitoramento SDRs; card Pareto | contadores batem com Firestore |
| Rep / Viewer | cards somente leitura | sem controles de escrita |

### 2.3 Pipeline (`/pipeline`)
| Item | Validação | Critério |
|---|---|---|
| Drag & drop | papel operacional (não viewer/design) | move persiste; erro → toast |
| Drop em estágio de handoff | só sdr/manager/master | outros papéis: toast explicativo, card não move |
| Estrela favorito | toggle operacional; filtro "Favoritos" | persiste `isFavorite`; filtro reduz a lista |
| Card (clique) | navega `/lead/:id` | página inteira abre |
| Novo Negócio | nome+empresa obrigatórios; BDR → status `in_queue` + toast da fila | deal criado no estágio certo |
| Modal Handoff | canal (4 opções), tipo visita, data futura, rep obrigatórios | erros por campo; falha → banner vermelho; sucesso → toast + batch atômico |
| Convergência | confirm exibido | deal espelho criado no Hunter |

### 2.4 Página do Lead (`/lead/:id`)
| Item | Validação | Critério |
|---|---|---|
| Voltar | histórico ou `/` | nunca beco sem saída |
| Estrela / Standby / Ganhar / Perder | papel operacional | persistem; feedback via toast |
| **Editar (botão e lápis)** | nome+empresa obrigatórios; valor numérico | modo inline; Salvar persiste; Cancelar restaura |
| Standby modal | mín. 5 follow-ups, intervalo ≤7 dias, preview de datas | activities criadas + badge "Em Standby" |
| Aba Notas | texto obrigatório p/ salvar | nota aparece na lista com autor/data |
| Aba Atividades | "Registrar" só nas próprias pendentes | conclui e some o botão |
| Aba Histórico | jornada real (criação→SDR→handoff→desfecho) | eventos com datas corretas |
| Equipe do lead | BDR/SDR/Rep visíveis pós-handoff | nomes corretos |

### 2.5 Cadência (`/cadencia`) — SDR
| Item | Validação | Critério |
|---|---|---|
| Alertas agenda | atrasadas (vermelho) / vencem hoje (âmbar) | contagens batem; botão → `/activities` |
| Toggle "Por cliente | Por bloco" | agrupamento por canal na ordem ligação→LinkedIn→WhatsApp→e-mail | pendentes antes de concluídas |
| Card follow-up | badge "Semana X · contato Y", 1 canal | denominador de progresso = nº real de atividades |
| Concluir atividade | abre CompleteActivityModal | taxa recalcula; moedas creditadas |
| Cabeçalho do card | clique → `/lead/:id` | navega |

### 2.6 Contatos (`/contacts`)
| Item | Validação | Critério |
|---|---|---|
| Busca + chips | filtra por nome/empresa/e-mail | resultado imediato |
| Novo/Editar Contato (modal) | nome+empresa obrigatórios | criação e edição persistem; painel de detalhe reflete edição |
| Detalhe: Novo Negócio | → `/pipeline` | navega |
| Importar | `disabled` + tooltip "em breve" | visivelmente inerte |

### 2.7 Atividades (`/activities`)
| Item | Validação | Critério |
|---|---|---|
| Escopo por papel | SDR vê SÓ as próprias | gestão/BDR veem o time |
| Filtros | Ligação/LinkedIn/WhatsApp/Email/Reunião/Ganho/Nota | filtram por tipo |
| Badges | Standby i/n, Agendada, Atrasada | status correto |

### 2.8 Handoffs (`/handoffs`) — Rep
Aceitar → callable + atividade criada com SLA configurado; Recusar → motivo obrigatório + gestor notificado; tabs com contadores corretos.

### 2.9 Admin (`/settings`, `/settings/metas`, `/settings/cadencia`)
| Item | Validação | Critério |
|---|---|---|
| Empresa | nome obrigatório | **persiste em settings/general** com feedback Salvo/Erro |
| Usuários (convite) | e-mail válido, papel, produtos | conta Auth criada + e-mail enviado |
| Cadência | cards/dia 0–10; contatos/semana 0–7; SLA 1–15 | clamps aplicados; motor usa na próxima execução |
| Metas | limites por campo | persiste em user_goals |
| Captação | CRUD fontes, chave exibida 1× | hash salvo, chave nunca re-exibida |

### 2.10 Demais telas
Empresas, Loja (resgate valida saldo), Carteira, Leaderboard, KPIs (filtros produto/vendedor), Projetos (wizard 3 passos com campos obrigatórios por passo), Comissões (fluxo dia 10/15), TV pública (sem dados financeiros sensíveis).

## 3. Integração — scripts de regressão (emulador)
| Script | Cobre |
|---|---|
| `test-handoff-e2e-emulator.mjs` | Handoff completo SDR→Rep (aceite + recusa) |
| `test-cohort-cf-emulator.mjs` | 4 cenários de cohorts do onDealStageChanged |
| `test-drop-denials-emulator.mjs` | Negações de rules que motivaram os fixes da Fase 0 |
| `test-rules-fases2-4-emulator.mjs` | in_queue BDR, standby, escopo de activities, settings/cadence |

## 4. Critério de aprovação para deploy
1. `npm run test -- --run` → **0 falhas** (linha de base atual: 624/624).
2. `node scripts/qa-scan-dead-controls.mjs` → 0 achados ativos (disabled+tooltip são aceitos).
3. Scripts de emulador → todos verdes.
4. `npx vite build` + `npm --prefix functions run build` → sem erros.
5. Cobertura de `src/utils` (lógica de negócio) ≥ 98% statements / 100% funções.
