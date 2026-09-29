export type UserRole = 'master' | 'manager' | 'bdr' | 'sdr' | 'rep' | 'design' | 'viewer' | string;

export type ProductId = 'wizmart' | 'smart_cafe';
export type ProductScope = 'all' | ProductId;

// ─── Produto SKU (cross-sell) ─────────────────────────────────────────────────
export type ProductSKU =
  | 'smartcafe_venda_direta'
  | 'smartcafe_snacks'
  | 'smartcafe_comodato'
  | 'smartcafe_locacao'
  | 'wizmart_minimercado'
  | 'wizmart_kit_alimentacao';

export const PRODUCT_SKU_LABELS: Record<ProductSKU, string> = {
  smartcafe_venda_direta:    'Smart Café Venda Direta (Máquina de Café)',
  smartcafe_snacks:          'Smart Café Venda Direta (Máquina de Snacks)',
  smartcafe_comodato:        'Smart Café Comodato',
  smartcafe_locacao:         'Smart Café Locação',
  wizmart_minimercado:       'WizMart Minimercado',
  wizmart_kit_alimentacao:   'WizMart Kit Alimentação',
};

export const PRODUCT_SKU_BY_FUNNEL: Record<ProductId, ProductSKU[]> = {
  wizmart:     ['wizmart_minimercado', 'wizmart_kit_alimentacao'],
  smart_cafe:  ['smartcafe_venda_direta', 'smartcafe_snacks', 'smartcafe_comodato', 'smartcafe_locacao'],
};

/** Nível de comissão do SDR (fixo no cadastro). Define o % no modelo padrão. */
export type CommissionTier = 'junior' | 'pleno' | 'senior';

// ─── User v2 ─────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  initials: string;
  color: string;
  role: UserRole;
  productIds: ProductId[];
  // Nível de comissão do SDR (fixo no cadastro) — define o % de comissão.
  // Só relevante para role 'sdr'. Ausente = tratar como 'junior'.
  commissionTier?: CommissionTier;
  level: number;
  levelName: string;
  points: number;
  coinBalance: number;
  streak: number;
  calendarConnected: boolean;
  isActive: boolean;
  createdAt?: any;
}

// ─── Legado (compatibilidade com código v1) ───────────────────────────────────
export interface Seller {
  id: string;
  name: string;
  initials: string;
  color: string;
}

// ─── Funil v3 ─────────────────────────────────────────────────────────────────
export type FunnelType = 'inbound' | 'outbound' | 'hunter' | 'main';

/**
 * Origem do lead como ATRIBUTO do card (não como funil).
 * Espelha `DealOrigin` em `functions/src/deals/dealOrigin.ts`.
 */
export type DealOrigin = 'inbound' | 'outbound';

export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  color?: string;
  isConvergencePoint: boolean;
  isHandoffRequired: boolean;
  coinsOnEnter: number;
  /** Pontos do Ranking Geral de Pontos ao entrar neste estágio — irmão de
   *  `coinsOnEnter`, mesma tela de Configurações. Ausente/0 = não pontua
   *  (PLANO_DESENHO_CRM_2.md — pontuação configurável). */
  pointsOnEnter?: number;
  slaBusinessDays: number;
  defaultTemplateIds: string[];
  /** Smart Café: indica que este estágio requer seleção de subtipo de conexão */
  hasConnectionSubtype?: boolean;
  /** IDs de estágios que devem ser pulados quando connectionType === 'standard_proposal' */
  skipStagesForSubtype?: string[];
  /** Estágio terminal de perda — ao mover deal aqui, status é marcado como 'lost' */
  isLost?: boolean;
  autoCreateActivity?: {
    type: 'email' | 'whatsapp' | 'call';
    dueDaysFromNow: number;
    templateId?: string;
  };
}

export interface Funnel {
  id: string;
  name: string;
  type: FunnelType;
  productId: ProductId;
  color: string;
  stages: FunnelStage[];
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Stage legado (compatibilidade) ──────────────────────────────────────────
export interface Stage {
  id: string;
  name: string;
}

// ─── Deal v2 ──────────────────────────────────────────────────────────────────
export type DealStatus = 'open' | 'converted' | 'won' | 'lost' | 'in_queue';

export interface Deal {
  id: string;
  name: string;
  company: string;
  /**
   * Vínculo explícito com o Contact escolhido no card (aba Visão Geral).
   * Fonte de verdade para resolver o destinatário de email/WhatsApp — substitui
   * o match frágil por `contacts.find(c => c.company === deal.company)`
   * (achado crítico, PLANO_DESENHO_CRM.md 13/09/2026). Ausente em deals
   * anteriores a este campo: ver `resolveDealContact` (utils/dealContact.ts)
   * para o fallback por nome da empresa.
   */
  contactId?: string;
  value: number;
  stage: string;
  funnelId?: string;
  funnelType?: FunnelType;
  productId?: ProductId;
  /**
   * De onde o lead veio — Inbound (levantou a mão num formulário nosso) ou
   * Outbound (prospecção ativa do time). Fase 1.3 do PLANO_DESENHO_CRM.md.
   *
   * NUNCA escrito pelo cliente (as rules bloqueiam): é derivado no servidor pela
   * CF `onDealParticipantsChanged` a partir de `leadOrigin`/`funnelType`, com a
   * regra em `functions/src/deals/dealOrigin.ts`.
   *
   * Existe porque o deck pede um board ÚNICO por produto (sem abas separadas de
   * Inbound e Outbound), mas com a quebra por origem nos cards e nos relatórios.
   * Deals antigos podem estar sem o campo até o backfill rodar — tratar ausente
   * como 'outbound' na leitura, igual ao default do servidor.
   */
  origin?: DealOrigin;
  owner: string;
  bdrId?: string;
  assignedSdrId?: string;
  assignedRepId?: string;
  /**
   * Espelho vivo de [owner, bdrId, assignedSdrId, assignedRepId] (sem duplicatas),
   * mantido pela Cloud Function `onDealParticipantsChanged` — nunca escrito pelo
   * cliente. Reflete só quem "assina" o card AGORA (não histórico: um Rep que
   * recusou handoff ou um SDR substituído após lead perdido saem daqui).
   * Base da regra "só vê quem participa" e do rateio de comissão.
   */
  participantIds?: string[];
  /**
   * Responsável atual (assignedRepId || assignedSdrId || bdrId || owner),
   * calculado uma única vez no servidor pela mesma CF. Alimenta o filtro
   * "Meus Cards" sem precisar recalcular em memória no client.
   */
  responsibleId?: string;
  due: string;
  /** Lead de grande potencial marcado com estrela pelo time */
  isFavorite?: boolean;
  /** Gatilho Standby ativo — régua obrigatória de follow-ups em andamento */
  standbyActive?: boolean;
  standbyStartedAt?: any;
  standbyFollowUps?: number;
  // tarefas legado v1 (e/w/m) — mantido para compatibilidade
  tasks: {
    e: boolean;
    w: boolean;
    m: boolean;
  };
  // handoff
  handoffStatus?: 'pending' | 'accepted' | 'completed';
  handoffAt?: any;
  handoffNotes?: string;
  priorityChannel?: 'email' | 'whatsapp' | 'call' | 'linkedin';
  linkedDealId?: string;
  linkedHunterDealId?: string;
  // visita
  visitType?: 'presential' | 'video';
  visitScheduledAt?: any;
  visitDoneAt?: any;
  /**
   * Data e hora da reunião com o SDR (etapa `reuniao_agendada`, Fase 1.1).
   * Coletada no modal ao mover o card para a etapa; é a base da régua de agenda
   * da Fase 3 — sem ela não há como calcular a confirmação "24h úteis antes".
   */
  meetingScheduledAt?: any;
  meetingDoneAt?: any;
  location?: {
    state: string;
    city: string;
    latitude?: number;
    longitude?: number;
  };
  // v3 — qualificação Smart Café
  clientSize?: 'small' | 'medium' | 'large';
  /**
   * Porte estimado da empresa (P/M/G) — Fase D3 do plano de assinaturas.
   * Diferente de `clientSize`: é um CHUTE inicial do BDR na pesquisa (antes de
   * qualquer contato), opcional, refinável pelo SDR depois. Não confundir com
   * `clientSize`, que é a qualificação FORMAL do funil Smart Café, coletada
   * pelo SDR/Rep já em contato com o cliente e usada no cálculo de proposta/SKU.
   * Ausente = tratar como 'M' só para efeito de cálculo (sem reclassificar
   * deals legados automaticamente). Usado pra guiar a distribuição balanceada
   * de leads entre SDRs (não deixar um SDR só com contas G).
   */
  companySizeEstimate?: 'P' | 'M' | 'G';
  connectionType?: 'standard_proposal' | 'meeting_scheduled' | 'visit_scheduled';
  // v3 — cross-sell
  mainProduct?: ProductSKU;
  additionalProducts?: ProductSKU[];
  /**
   * Contrato do Comodato Smart Café (Fase 5.4 do PLANO_DESENHO_CRM.md, slide 11).
   * Escrito por quem fecha o negócio (rep/gestão) ao anexar o PDF assinado no
   * card. `financeiro` NUNCA escreve este campo — só `contractPaidAt` abaixo.
   */
  contract?: {
    url: string;
    storagePath: string;
    fileName: string;
    mime: string;
    size: number;
    uploadedBy: string;
    uploadedAt: any;
  };
  /**
   * Marcado pelo papel `financeiro` ao confirmar que a 1ª mensalidade do
   * comodato foi paga — é o gatilho de comissão do modelo `smartcafe_comodato`
   * (`requiresFirstInvoice` em `comissoes/calc.ts`). `firestore.rules` permite a
   * `financeiro` escrever ESTES DOIS campos e nada mais no documento do deal.
   */
  contractPaidAt?: any;
  contractPaidBy?: string;
  // v3 — KPI
  visitPopulation?: number;
  conquestValue?: number;
  conquestType?: 'pdv' | 'contract_value'; // pdv = contagem de PDVs; contract_value = R$ (comodato Smart Café)
  // v3 — coorte
  cohortKeys?: {
    prospectsSharedMonth?: string;
    visitScheduledMonth?: string;
    conquestMonth?: string;
    activitiesCount?: number;
  };
  // captação de leads (WizMart Forms)
  leadOrigin?: DealLeadOrigin;
  status?: DealStatus;
  /** Motivo estruturado de perda — obrigatório ao marcar o negócio como perdido */
  lostReason?: LostReasonId;
  lostReasonNote?: string;
  /** Devolvido ao BDR para nova tentativa futura de prospecção (motivos específicos) */
  requeuedForBdr?: boolean;
  requeuedAt?: any;
  /** Momento em que o lead foi atribuído ao SDR — ancora a régua de cadência e o vencimento do card */
  assignedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Motivos de perda (Observações do cliente, jul/2026) ─────────────────────

export type LostReasonId =
  | 'valor_alto'
  | 'quer_fornecedor'
  | 'quer_franqueado'
  | 'fechou_concorrente'
  | 'fora_perfil_evento'
  | 'fora_perfil_area'
  | 'duplicado_outro_sdr'
  | 'duplicado'
  | 'sem_interesse_momento'
  | 'repassado_wiz'
  | 'repassado_smart'
  | 'sem_contato';

// ─── Captação de Leads (WizMart Forms) ───────────────────────────────────────

/** Origem de um deal criado pelo endpoint público de captação. */
export interface DealLeadOrigin {
  leadId: string;
  sourceId: string;
  sourceName: string;
  utm?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  };
  pageUrl?: string;
}

/**
 * Fonte de captação (site/landing page do cliente).
 * Coleção: tenants/{tid}/lead_sources — gerenciada pelo master/manager na UI.
 * A chave em claro NUNCA é armazenada; apenas o hash SHA-256.
 */
export interface LeadSource {
  id: string;
  name: string;
  apiKeyHash: string;
  /** Primeiros caracteres da chave (ex.: "wzk_ab12…") p/ identificação visual */
  apiKeyPrefix: string;
  /** Origens permitidas, ex.: ["https://wizmart.com.br", "https://*.wizmart.com.br"] */
  allowedOrigins: string[];
  funnelId: string;
  productId: ProductId;
  /** uid do responsável que recebe os deals desta fonte (opcional) */
  defaultOwner?: string;
  turnstileEnabled: boolean;
  isActive: boolean;
  stats?: {
    received: number;
    blocked: number;
    lastLeadAt?: any;
  };
  createdAt?: any;
  updatedAt?: any;
}

export type LeadStatus = 'new' | 'converted' | 'duplicate' | 'discarded';

/**
 * Registro bruto de lead recebido pelo endpoint público.
 * Coleção: tenants/{tid}/leads — escrita SOMENTE via Admin SDK (Cloud Function).
 */
export interface Lead {
  id: string;
  sourceId: string;
  status: LeadStatus;
  /** deal criado (status converted) ou existente (status duplicate) */
  dealId?: string;
  data: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    message?: string;
    custom?: Record<string, string>;
  };
  tracking?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    pageUrl?: string;
    referrer?: string;
  };
  meta?: {
    ip: string;
    userAgent: string;
    origin: string;
  };
  /** hash de dedupe (sourceId + email/telefone normalizado) */
  dedupeKey?: string;
  createdAt?: any;
}

/**
 * Notificação in-app. Coleção: tenants/{tid}/notifications — criada SOMENTE
 * por Cloud Functions; usuário lê as próprias e só pode marcar `read`.
 */
export interface AppNotification {
  id: string;
  userId: string;
  type: 'lead_received' | 'note_mention' | string;
  title: string;
  body: string;
  dealId?: string;
  leadId?: string;
  sourceId?: string;
  /** Rota interna para onde o sino leva; sem ela vai para o card/pipeline. */
  link?: string;
  read: boolean;
  createdAt?: any;
}

// ─── Notas ricas do card ─────────────────────────────────────────────────────

/** Entidade à qual a nota está ancorada. Hoje só `deal`; contact/company são
 *  suportados pelo modelo para reaproveitar a feature sem refatoração. */
export type NoteEntityType = 'deal' | 'contact' | 'company';

export type NoteAttachmentKind = 'image' | 'video' | 'audio' | 'document';

/** Origem do anexo — só telemetria de UX, não afeta permissão. */
export type NoteAttachmentSource = 'upload' | 'camera' | 'mic' | 'paste';

/**
 * Anexo de uma nota. O binário mora no Storage em
 * `tenants/{tid}/notes/{noteId}/{id}/{name}`; este objeto é só o metadado
 * guardado dentro do doc da nota.
 */
export interface NoteAttachment {
  id: string;
  kind: NoteAttachmentKind;
  /** Nome original sanitizado — usado na exibição e no download */
  name: string;
  mime: string;
  size: number;
  storagePath: string;
  url: string;
  /** Miniatura (imagem) ou poster (vídeo), gerados no client */
  thumbPath?: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  source: NoteAttachmentSource;
  uploadedBy: string;
  uploadedAt?: any;
}

/**
 * Nota do card. Coleção: `tenants/{tid}/notes`.
 *
 * Vive separada de `activities` de propósito: `activities` é assinada inteira
 * por várias telas e alimenta KPIs/gamificação — anexos e markdown não têm o
 * que fazer lá. Uma Cloud Function espelha um resumo enxuto em `activities`
 * para o feed geral continuar mostrando as notas (sem os anexos).
 *
 * Permissões: autor edita e exclui a sua; master exclui qualquer uma
 * (moderação); viewer e design leem tudo, inclusive anexos.
 */
export interface Note {
  id?: string;
  tenantId: string;
  entityType: NoteEntityType;
  entityId: string;
  /** Espelha `entityId` quando entityType === 'deal' — mantém a query simples */
  dealId?: string;
  productId: ProductId;
  authorId: string;
  /** Markdown cru — fonte da verdade; a renderização é sempre sanitizada */
  body: string;
  attachments: NoteAttachment[];
  /** uids mencionados no body, desnormalizados para a trigger de notificação */
  mentions?: string[];
  pinned?: boolean;
  createdAt?: any;
  updatedAt?: any;
  /** Só existe a partir da 1ª edição — dispara o selo "editada" */
  editedAt?: any;
  editCount?: number;
}

// ─── Activity v2 ─────────────────────────────────────────────────────────────
// 'agenda' — tarefas da régua de agenda (Fase 3 do PLANO_DESENHO_CRM.md):
// follow-up e confirmação de compromisso já marcado. Tipo próprio para NÃO
// ser contado como reunião pelos indicadores de "Reuniões Agendadas".
export type ActivityType =
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'call'
  | 'meeting'
  | 'visit'
  | 'proposal'
  | 'note'
  | 'win' | 'agenda';

export type ActivityStatus = 'pending' | 'completed' | 'overdue' | 'skipped' | 'rescheduled';

export type CadenceType = 'sdr_daily' | 'rep_followup' | 'smart_reschedule' | 'manual';

export interface Activity {
  id?: string;
  dealId?: string;
  contactId?: string;
  productId?: ProductId;
  userId: string;
  type: ActivityType;
  cadenceType?: CadenceType;
  status: ActivityStatus;
  scheduledAt?: any;
  dueAt?: any;
  completedAt?: any;
  templateId?: string;
  templateUsed?: boolean;
  calendarEventId?: string;
  calendarSyncedAt?: any;
  outcome?: string;
  clientResponseType?: 'interested' | 'not_now' | 'not_interested' | 'no_response';
  rescheduleNote?: string;
  coinsAwarded: number;
  coinsAwardedAt?: any;
  wasOnTime?: boolean;
  overdueNotifiedAt?: any;
  overdueNotificationCount?: number;
  /**
   * Bloco de horário em que a atividade cai (Fase 2 do PLANO_DESENHO_CRM.md).
   * Gravado pelo `dailyCadenceEngine` a partir de `settings/cadence.sdr.timeBlocks`;
   * `null` quando o canal não tem bloco configurado — a atividade aparece no
   * grupo "Sem horário definido" da fila, nunca é escondida.
   * Atividades anteriores à Fase 2 não têm o campo: a tela reagrupa pelo `type`.
   */
  blockId?: string | null;
  createdAt?: any;
  // campos legado compatibilidade
  who?: string;
  text?: string;
  val?: string;
  time?: string;
}

// ─── ActivityFeedItem — alias legado ─────────────────────────────────────────
export type ActivityFeedItem = Activity;

// ─── Cadência SDR ────────────────────────────────────────────────────────────
export interface DailyCadenceCard {
  dealId: string;
  contactId?: string;
  contactName: string;
  companyName: string;
  isNew: boolean;
  activities: {
    email?: { activityId: string; status: ActivityStatus };
    linkedin?: { activityId: string; status: ActivityStatus };
    whatsapp?: { activityId: string; status: ActivityStatus };
    call?: { activityId: string; status: ActivityStatus };
  };
}

export interface DailyCadenceQueue {
  id?: string;
  sdrId: string;
  date: string;
  cardsDistributed: number;
  previousCompletionRate: number;
  activitiesRequired: number;
  activitiesCompleted: number;
  completionRate: number;
  cards: DailyCadenceCard[];
  generatedAt?: any;
}

// ─── Handoff ──────────────────────────────────────────────────────────────────
export interface Handoff {
  id?: string;
  dealId: string;
  hunterDealId?: string;
  productId?: ProductId;
  fromSdrId: string;
  toRepId: string;
  priorityChannel: 'email' | 'whatsapp' | 'call' | 'linkedin';
  visitType: 'presential' | 'video';
  visitScheduledAt?: any;
  notes: string;
  status: 'pending_rep_acceptance' | 'accepted' | 'declined';
  acceptedAt?: any;
  declinedReason?: string;
  createdAt?: any;
}

// ─── Templates de Playbook ───────────────────────────────────────────────────
export interface PlaybookTemplate {
  id?: string;
  name: string;
  funnelType: FunnelType | 'all';
  stageId?: string;
  activityType: 'email' | 'whatsapp' | 'call' | 'linkedin';
  role: 'sdr' | 'rep' | 'all';
  productId?: ProductId;
  subject?: string;
  body: string;
  variables: string[];
  isActive: boolean;
  usageCount: number;
  createdAt?: any;
}

// ─── Moedas / Gamificação v2 ─────────────────────────────────────────────────
export type CoinEventType =
  | 'activity_ontime'
  | 'meeting_scheduled'
  | 'visit_scheduled'
  | 'visit_done'
  | 'proposal_presented'
  | 'contract_signed'
  | 'pdv_3k'
  | 'pdv_10k'
  | 'pdv_20k'
  | 'redemption'
  | 'admin_adjustment';

export interface CoinTransaction {
  id?: string;
  userId: string;
  productId?: ProductId;
  amount: number;
  type: CoinEventType;
  activityId?: string;
  dealId?: string;
  paymentId?: string;
  prizeId?: string;
  redemptionId?: string;
  note?: string;
  cycle: string;
  createdAt?: any;
  createdBy: string;
}

export interface Prize {
  id?: string;
  productId?: ProductScope;
  name: string;
  description: string;
  imageUrl: string;
  coinCost: number;
  stock: number;
  category: 'voucher' | 'produto' | 'experiencia';
  isActive: boolean;
  availableFrom?: any;
  availableTo?: any;
}

export interface CoinRedemption {
  id?: string;
  userId: string;
  productId?: ProductId;
  userName: string;
  prizeId: string;
  prizeName: string;
  coinAmount: number;
  cycle: string;
  deliveryInfo?: string;
  status: 'requested' | 'processing' | 'delivered' | 'cancelled';
  adminNotes?: string;
  createdAt?: any;
  updatedAt?: any;
}

// ─── KPI Snapshots ───────────────────────────────────────────────────────────
export interface KpiSnapshot {
  id?: string;
  role: 'sdr' | 'rep' | 'all';
  userId?: string;
  productId?: string;
  period: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  activitiesEmail?: number;
  activitiesLinkedin?: number;
  activitiesWhatsapp?: number;
  activitiesCall?: number;
  cadenceCompletionRate?: number;
  /** Atividades `type: 'meeting'` criadas no período (por SDR: `userId`). Regra em functions/src/kpis/agendaMetrics.ts. */
  meetingsScheduled?: number;
  /** Deals hoje em etapa de visita/degustação (por SDR: `assignedSdrId`) — estoque na hora da execução. */
  visitsScheduled?: number;
  /** Quebra por origem das reuniões — `unresolved` é reunião cujo deal não foi encontrado. */
  meetingsByOrigin?: { inbound: number; outbound: number; unresolved: number; total: number };
  visitsByOrigin?: { inbound: number; outbound: number; total: number };
  visitsByState?: Record<string, number>;
  visitsByCity?: Record<string, number>;
  visitsDone?: number;
  pdvsConquered?: number;
  proposalsPresented?: number;
  contractsSigned?: number;
  revenue?: number;
  coinsEarned?: number;
  dealsCreated?: number;
  dealsWon?: number;
  dealsLost?: number;
  conversionRate?: number;
  // v3 — indicadores da diretoria
  prospectsShared?: number;
  activitiesGoal?: number;
  activitiesActual?: number;
  visitsScheduledByState?: Record<string, number>;
  conquestsPdv?: number;
  installations?: number;
  updatedAt?: any;
}

// ─── UserGoal — metas configuradas pelo admin ─────────────────────────────────
export interface UserGoal {
  id?: string;
  userId: string;
  role: 'sdr' | 'rep';
  activitiesPerDay: number;
  visitsPerMonth?: number;
  meetingsPerMonth?: number;
  conquestsPerMonth?: number;
  updatedBy?: string;
  updatedAt?: any;
}

// ─── ProjectRequest — módulo de projetos de layout ────────────────────────────
export type PDVType = 'nanomarket' | 'micromarket' | 'store' | 'container';
export type ProjectStatus = 'pending' | 'in_progress' | 'delivered';

export interface ProjectRequest {
  id?: string;
  dealId: string;
  companyName: string;
  requestedBy: string;
  requestedByName: string;
  /** Papel real de quem pediu — gestão (manager/master) também solicita. */
  requestedByRole: 'bdr' | 'sdr' | 'rep' | 'manager' | 'master';
  pdvTypes: PDVType[];
  quantities: {
    gondola: number;
    fridge: number;
    freezerVertical: number;
    freezerHorizontal: number;
    luminary: number;
    sign: number;
  };
  walls: { wall1: string; wall2: string; wall3: string };
  notes: string;
  /** Fotos/vídeos do local (legado: só URLs). Solicitações novas trazem `attachments`. */
  mediaUrls: string[];
  attachments?: NoteAttachment[];
  status: ProjectStatus;
  assignedToDesignerId?: string;
  assignedToDesignerName?: string;
  assignedAt?: any;
  /** Link de entrega (Drive etc.) — opcional quando há arquivo entregue. */
  deliveredFileUrl?: string;
  /** Arquivos do projeto pronto, enviados pelo Design (PDF, imagem, vídeo). */
  deliveredAttachments?: NoteAttachment[];
  deliveredByName?: string;
  deliveredAt?: any;
  requestedAt: any;
  updatedAt: any;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
export interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  initials: string;
  color: string;
  pts: number;
  coinBalance?: number;
  emails: number;
  whats: number;
  meetings: number;
  level: string;
  streak: number;
  trend: number;
  productIds?: ProductId[];
}

// ─── Conquistas ───────────────────────────────────────────────────────────────
export interface Achievement {
  id?: string;
  icon: string;
  name: string;
  date?: string;
  prog?: number;
  unlocked: boolean;
}

// ─── TV Display ───────────────────────────────────────────────────────────────
export interface TvSeller {
  name: string;
  val: number;
  pct: number;
}

export interface TvLink {
  id?: string;
  token: string;
  deviceName?: string;
  productId?: ProductScope;
  created: string;
  expires: string;
  /** Validade em epoch ms, para o servidor comparar — `null`/ausente = nunca expira.
   *  `expires` continua só o texto exibido na tela (PLANO_DESENHO_CRM_2.md, B6). */
  expiresAtMs?: number | null;
  active: boolean;
  /** Métricas que o canal pode exibir — o gate real acontece no servidor (`tvHelper`). */
  allowedMetrics?: string[];
  /** Período inicial do Ranking de SDRs; quem está na TV pode alternar. */
  rankingPeriod?: 'day' | 'week' | 'month';
}

/**
 * `tenants/{tid}/settings/gamification` — pontuação configurável pelo master
 * (PLANO_DESENHO_CRM_2.md). Ações que não são etapa de funil (etapa usa
 * `FunnelStage.pointsOnEnter`, ao lado de `coinsOnEnter`) e os pesos do pódio
 * de SDRs na TV. Documento pode não existir, ou vir parcial — ver
 * `utils/gamificationSettings.ts` para os padrões.
 */
export interface GamificationSettings {
  actionPoints?: Partial<{
    /** Negócio criado — hoje concedido por `onDealCreate.ts` a quem criou o card. */
    dealCreated: number;
    emailSent: number;
    whatsappSent: number;
    /** A tarefa "Agendar reunião" do checklist do card — diferente da etapa
     *  Reunião Agendada do funil, que pontua via `pointsOnEnter`. */
    meetingTaskDone: number;
    dealWon: number;
  }>;
  /** Pesos da fórmula que ordena o pódio da TV — visitas continua o critério
   *  dominante nos padrões (D5, confirmado com o cliente); o master pode
   *  reequilibrar. `score = visits*peso.visits + meetingsDone*peso.meetingsDone + actPct*peso.actPct`. */
  sdrRankingWeights?: Partial<{
    visits: number;
    meetingsDone: number;
    actPct: number;
  }>;
}

// ─── Settings / Admin ─────────────────────────────────────────────────────────
export interface SettingUser {
  id?: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  role: UserRole;
  productIds?: ProductId[];
  commissionTier?: CommissionTier;
  last: string;
  isActive?: boolean;
  /**
   * Instante do último login (Fase 6.1 do PLANO_DESENHO_CRM.md), gravado pela
   * CF `logSessionEvent`. `last` (acima) continua existindo como o texto
   * pronto para a coluna "Último Acesso" — este campo é a fonte estruturada
   * por trás dele, para ordenar/filtrar sem parsear string.
   */
  lastLoginAt?: any;
  /**
   * Gravado pela CF `endUserSession` ("Encerrar Sessão", Fase 6.1). Sozinho,
   * `revokeRefreshTokens` não derruba uma sessão já aberta — o ID token em
   * cache no navegador segue válido até expirar (~1h) sem precisar de
   * refresh. `useAuth.ts` assina este documento ao vivo e compara o valor
   * deste campo com o último visto NESTA sessão do listener: se ele MUDAR
   * enquanto o listener já estava aberto, força `signOut()` na hora — sem
   * esperar reload.
   */
  forceLogoutAt?: any;
}

// ─── Auditoria de sessão (Fase 6.1 do PLANO_DESENHO_CRM.md) ──────────────────
// Slide 12: "Gerenciador de Login e Logoff do CRM". Coleção
// `tenants/{tid}/user_sessions`, escrita só por Cloud Function — nunca pelo
// client (o valor de IP/user-agent perde o sentido de auditoria se quem está
// sendo auditado puder escrever o próprio registro).
export type SessionEventType = 'login' | 'logout' | 'revoked';

export interface UserSessionEvent {
  id?: string;
  uid: string;
  userName: string;
  userRole: UserRole;
  event: SessionEventType;
  at: any;
  ip?: string;
  userAgent?: string;
  /** Preenchido só em `event: 'revoked'` — quem forçou o encerramento. */
  endedBy?: string;
  endedByName?: string;
}

// ─── Contact v2 ──────────────────────────────────────────────────────────────
export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  whats: string;
  owner: string;
  last: string;
  tags: string[];
  deals: number;
  productIds?: ProductId[];
}

// ─── Company v2 ──────────────────────────────────────────────────────────────
export interface Company {
  id?: string;
  name: string;
  segment: string;
  deals: number;
  value: number;
  productIds?: ProductId[];
}
