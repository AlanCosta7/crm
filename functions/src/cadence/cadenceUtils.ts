/**
 * cadenceUtils.ts — Utilitários puros do Motor de Cadência SDR
 *
 * Todas as funções são puras (sem I/O) e totalmente testáveis.
 *
 * Regra de negócio (REQUISITOS-V2.md §6):
 *   novosCards = Math.floor(3 × taxaConclusaoOntem)
 *   1º dia sem histórico → taxa = 1.0 → 3 cards
 *   SDR bloqueado (taxa = 0) → 0 cards
 */

// ── Tipos compartilhados ──────────────────────────────────────────────────────

export type ActivityType = 'email' | 'linkedin' | 'whatsapp' | 'call';

export interface CadenceActivity {
  type: ActivityType;
  status: 'pending' | 'completed' | 'overdue' | 'skipped';
  activityId?: string;
}

export interface CadenceCard {
  dealId: string;
  contactName: string;
  companyName: string;
  productId: string;
  isNew: boolean; // card distribuído hoje vs carry-over de ontem
  activities: Record<ActivityType, CadenceActivity>;
}

export interface DailyQueue {
  sdrId: string;
  date: string;
  cardsDistributed: number;
  previousCompletionRate: number;
  activitiesRequired: number;
  activitiesCompleted: number;
  completionRate: number;
  cards: CadenceCard[];
}

// ── Fórmula principal ─────────────────────────────────────────────────────────

/**
 * Calcula quantos novos cards o SDR receberá hoje.
 * @param rate Taxa de conclusão de ontem (0–1). null = primeiro dia.
 * @returns Número de cards (0–3)
 */
export function calcNewCards(rate: number | null): number {
  if (rate === null) return 3; // Primeiro dia: recebe 3 (taxa padrão = 1.0)
  return Math.min(3, Math.max(0, Math.floor(3 * rate)));
}

/**
 * Calcula a taxa de conclusão de uma fila de cadência.
 * @returns Valor entre 0 e 1.
 */
export function calcCompletionRate(completed: number, required: number): number {
  if (required <= 0) return 1; // sem tarefas = 100% (não penaliza)
  return Math.min(1, completed / required);
}

/**
 * Calcula o total de atividades requeridas para uma lista de cards.
 * Cada card tem 4 atividades (email, linkedin, whatsapp, call).
 */
export function calcRequiredActivities(cardCount: number): number {
  return cardCount * 4;
}

// ── Data em BRT ───────────────────────────────────────────────────────────────

/**
 * Retorna a data atual no fuso de Brasília (GMT-3) como "YYYY-MM-DD".
 * Injetável para facilitar testes.
 */
export function getTodayBRT(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Retorna a data de ontem em BRT como "YYYY-MM-DD".
 */
export function getYesterdayBRT(now: Date = new Date()): string {
  const brtToday = getTodayBRT(now);
  const [y, m, d] = brtToday.split("-").map(Number);
  const yesterday = new Date(y, m - 1, d - 1);
  return yesterday.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// ── Validação de queue ────────────────────────────────────────────────────────

/**
 * Verifica se uma fila de cadência foi gerada hoje (evita re-execução do cron).
 */
export function isQueueFreshForToday(queue: DailyQueue | null, todayBRT: string): boolean {
  if (!queue) return false;
  return queue.date === todayBRT;
}

// ── Tipos de atividade da cadência SDR ───────────────────────────────────────

export const SDR_ACTIVITY_TYPES: ActivityType[] = ['email', 'linkedin', 'whatsapp', 'call'];

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, { icon: string; label: string; color: string; bg: string }> = {
  email:    { icon: 'Mail',           label: 'Email',     color: '#1A6B1A', bg: '#E5F0E5' },
  linkedin: { icon: 'Linkedin',       label: 'LinkedIn',  color: '#0077B5', bg: '#E8F4FD' },
  whatsapp: { icon: 'MessageCircle',  label: 'WhatsApp',  color: '#25D366', bg: '#DCFCE7' },
  call:     { icon: 'Phone',          label: 'Ligação',   color: '#F59E0B', bg: '#FEF3C7' },
};

// ── Moedas por atividade ──────────────────────────────────────────────────────

/** Moedas ganhas ao completar uma atividade no prazo. */
export const COINS_PER_ACTIVITY_ONTIME = 1;

/** Moedas ganhas ao agendar uma visita (handoff). */
export const COINS_FOR_VISIT_SCHEDULED = 1;

/** Moedas ganhas ao completar reunião agendada. */
export const COINS_FOR_MEETING_DONE = 1;
