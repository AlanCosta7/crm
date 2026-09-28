# WizMart CRM v2 — Guia de Operação & Onboarding

Este documento serve como manual de operação e treinamento para o time comercial (BDRs, SDRs, Representantes e Gestores) e equipe de infraestrutura no **WizMart CRM v2**.

---

## 1. Como Rodar Localmente (Desenvolvimento e Homologação)

Para iniciar os serviços locais, certifique-se de ter o **Node.js (versão 22)** instalado e execute os comandos abaixo na pasta raiz do projeto (`/wizmart-crm`):

```bash
# 1. Instalar as dependências do monorepo (se ainda não instaladas)
npm install
npm run build --prefix functions

# 2. Iniciar os emuladores Firebase (Auth, Firestore, Realtime Database, Cloud Functions)
# Certifique-se de possuir o Java 21 instalado no sistema
npm run emulators

# 3. Em um terminal separado, popule os emuladores com dados realistas (BDR, SDR, Rep, etc.)
npm run emulators:seed

# 4. Inicie o servidor de desenvolvimento React + Vite
npm run dev
```

### Backfill de Segmentação por Produto

O CRM usa `productId` em entidades transacionais e `productIds` em entidades compartilháveis como usuários, contatos e empresas. Para bases antigas, rode primeiro em dry-run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run backfill:product-scope
```

Para aplicar no ambiente alvo:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run backfill:product-scope -- --apply
```

Para também sincronizar custom claims de usuários com `tenantId`, `role` e `productIds`:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run backfill:product-scope -- --apply --sync-claims
```

Parâmetros úteis: `--tenant=wizmart_sp`, `--product=wizmart` e `--limit=100`. Sem `--apply`, o script apenas lista as alterações.

### Contas de Homologação (Senha padrão: `senha_de_teste_123`)
* **Admin Master:** `master@wizmart.com.br` (Visualiza tudo, configura regras)
* **Gestor Comercial:** `manager@wizmart.com.br` (Visualiza KPIs do time, cria prêmios e templates)
* **BDR:** `bdr@wizmart.com.br` (Cria e distribui leads para a fila inicial)
* **SDR:** `sdr@wizmart.com.br` (Qualificação inicial, cadência e handoff)
* **Representante:** `rep@wizmart.com.br` (Aceita handoffs, realiza visitas e fecha negócios)
* **Visualizador:** `viewer@wizmart.com.br` (Acesso somente leitura para relatórios/KPIs)

---

## 2. Fluxo de Trabalho Comercial (Passo a Passo)

```
 BDR (Prospecção) ──► SDR (Qualificação + Handoff) ──► Representante (Fechamento)
 [Pipeline: Open]      [Pipeline: Visita Agendada]      [Funil Hunter: Won/Lost]
```

### 🎯 Passo 1: Prospecção e Entrada de Leads (BDR)
1. O BDR faz o login em `bdr@wizmart.com.br`.
2. Acessa a tela de **Pipeline** e clica em **Novo Negócio**.
3. Preenche as informações obrigatórias (Nome do lead, Razão Social da empresa, valor estimado e data).
4. O estágio inicial deve ser configurado como **Qualificação SDR** ou **Lead Recebido**. O deal é alocado no funil Inbound ou Outbound correspondente.

### ⚡ Passo 2: Cadência de Qualificação & Handoff (SDR)
1. O SDR acessa `sdr@wizmart.com.br`.
2. Em **Cadência Diária**, ele visualiza sua lista de tarefas do dia geradas automaticamente (e-mail, ligação, whatsapp, linkedin).
3. Após fazer contato e confirmar o interesse em uma visita, o SDR vai até a tela **Pipeline**.
4. Ele arrasta o card do negócio da coluna de qualificação e solta na coluna **Visita Agendada** (estágio configurado com Handoff obrigatório).
5. O formulário de **Passagem de Bastão** abrirá na tela:
   * Define o canal prioritário (WhatsApp / Ligação / E-mail).
   * Define o tipo de visita (Presencial / Video call).
   * Define a data e hora da reunião.
   * Seleciona o Representante Designado (ex: Carla Rep).
   * Escreve observações cruciais sobre as necessidades do cliente.
6. Clica em **Confirmar Handoff**. O deal original é marcado visualmente como **Convertido** no funil Inbound e um deal espelho correspondente é criado automaticamente no funil **Hunter**.

### 💼 Passo 3: Fechamento e Visitas (Representante)
1. O Representante acessa `rep@wizmart.com.br`.
2. O sistema exibe um alerta de novos handoffs. Ele clica na aba **Handoffs** no menu lateral.
3. Sob a aba **Pendentes**, ele analisa as notas do SDR e clica em **Aceitar handoff**.
4. O negócio é integrado ao seu pipeline de fechamento. O Representante realiza a visita agendada.
5. Ao concluir a visita, o sistema abre um modal obrigatório questionando a **próxima ação** (a ser agendada em no máximo 3 dias úteis para manter o SLA ativo).
6. Ele avança o negócio para **Proposta Apresentada** -> **Negociação** -> **Contrato Assinado**.
7. Ao marcar o deal como **Ganho** (Won), as moedas e pontos do comissionamento são distribuídos instantaneamente para SDR, Rep e BDR envolvidos.

---

## 3. Guia de Gamificação e Loja de Prêmios

* **Pontos (XP):** Determinam a classificação no **Leaderboard** semanal/mensal e evolução de nível (Iniciante, Prospector, Vendedor Pro, Closer, Top Performer).
* **Moedas (Coins):** Saldo resgatável para uso na loja interna de prêmios. São imutáveis e auditadas via Ledger (`coin_ledger`).
* **Como Ganhar Moedas:**
  * Atividade de cadência concluída no prazo (+1 moeda)
  * Visita realizada (+1 moeda)
  * Proposta comercial enviada (+1 moeda)
  * Contrato assinado (+1 moeda)
  * PDV faturou > R$ 3k / 10k / 20k (+3 / +5 / +10 moedas para SDR, Rep e BDR)
* **Loja de Prêmios:** O Gestor comercial pode acessar a tela de **Loja** para gerenciar prêmios e estoque. Usuários operacionais solicitam resgates de vouchers, folgas ou produtos físicos diretamente pela carteira.

---

## 4. Gerenciamento do Display de TV Pública

A visualização de TV é ideal para expor em monitores no escritório comercial e motivar o time.

1. Faça login como **Admin Master** e acesse a aba **KPIs**.
2. No painel de controle, navegue até a seção de gerenciamento de TV e clique em **Gerar Link**.
3. Configure os parâmetros de segurança:
   * **allowedMetrics:** Escolha as estatísticas permitidas para exibição pública (ex: metas concluídas, leaderboard duplo).
   * **financeiro_real:** Desmarque se o monitor ficar em local público (recepção) para ocultar valores monetários (R$).
   * **productId:** Filtre para exibir apenas métricas da marca WizMart, Smart Café ou de ambas.
4. Copie o link seguro gerado e configure o navegador da TV para carregar essa URL em tela cheia (F11).
5. O painel se atualizará automaticamente em menos de 100ms via WebSockets do Firebase RTDB sempre que um vendedor concluir metas.
