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

export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  color?: string;
  isConvergencePoint: boolean;
  isHandoffRequired: boolean;
  coinsOnEnter: number;
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
  value: number;
  stage: string;
  funnelId?: string;
  funnelType?: FunnelType;
  productId?: ProductId;
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
  type: 'lead_received' | string;
  title: string;
  body: string;
  dealId?: string;
  leadId?: string;
  sourceId?: string;
  read: boolean;
  createdAt?: any;
}

// ─── Activity v2 ─────────────────────────────────────────────────────────────
export type ActivityType =
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'call'
  | 'meeting'
  | 'visit'
  | 'proposal'
  | 'note'
  | 'win';

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
  /** Posição na sequência de contato configurada (settings/cadence.sdr.sequence). */
  sequenceOrder?: number;
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
  meetingsScheduled?: number;
  visitsScheduled?: number;
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
  requestedByRole: 'bdr' | 'sdr' | 'rep';
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
  mediaUrls: string[];
  status: ProjectStatus;
  assignedToDesignerId?: string;
  assignedAt?: any;
  deliveredFileUrl?: string;
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
  productId?: ProductScope;
  created: string;
  expires: string;
  active: boolean;
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
