/**
 * cadenceUtils.ts (frontend) — Re-exporta os utilitários do motor de cadência
 * para uso nos componentes React (CadenciaPage, useCadencia, etc.)
 *
 * Fonte de verdade: functions/src/cadence/cadenceUtils.ts
 * Esta cópia existe para que o frontend não importe código de Cloud Functions.
 *
 * Testes em: src/utils/cadenceUtils.test.ts
 */

export type ActivityType = 'email' | 'linkedin' | 'whatsapp' | 'call';

export interface CadenceActivity {
  type: ActivityType;
  status: 'pending' | 'completed' | 'overdue' | 'skipped';
  activityId?: string;
  /** Posição na sequência configurada pelo admin (ordem de exibição sugerida). */
  sequenceOrder?: number;
}

export interface CadenceCard {
  dealId: string;
  contactName: string;
  companyName: string;
  productId?: string;
  isNew: boolean;
  /** Card de follow-up da cadência semanal decrescente (1 contato) */
  followUp?: boolean;
  /** Rótulo do follow-up, ex.: "Semana 2 · contato 1" */
  weekLabel?: string;
  /** Card de um passo tardio da sequência de contato (dayOffset > 0). */
  sequenceStep?: boolean;
  /** Rótulo do passo de sequência, ex.: "Sequência · WhatsApp" */
  sequenceLabel?: string;
  activities: Partial<Record<ActivityType, CadenceActivity>>;
}

// ── Sequência de contato configurável (espelho de functions/cadenceUtils) ────

export type Period = 'manha' | 'tarde' | 'fim_dia';

export interface SequenceStep {
  type: ActivityType;
  dayOffset: number;
  period: Period;
}

export interface PeriodTimes {
  manha: string;
  tarde: string;
  fim_dia: string;
}

export const DEFAULT_PERIOD_TIMES: PeriodTimes = { manha: '09:00', tarde: '13:00', fim_dia: '18:00' };

export const PERIOD_LABEL: Record<Period, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  fim_dia: 'Fim do dia',
};

export const DAY_OFFSET_OPTIONS = [
  { value: 0, label: 'Hoje' },
  { value: 1, label: 'Amanhã' },
  { value: 2, label: 'Em 2 dias' },
  { value: 3, label: 'Em 3 dias' },
];

export function dayOffsetLabel(n: number): string {
  return DAY_OFFSET_OPTIONS.find(o => o.value === n)?.label ?? `Em ${n} dias`;
}

export interface DailyQueue {
  id?: string;
  sdrId: string;
  date: string;
  cardsDistributed: number;
  previousCompletionRate: number;
  activitiesRequired: number;
  activitiesCompleted: number;
  completionRate: number;
  cards: CadenceCard[];
  generatedAt?: any;
}

/** Calcula novos cards. null = primeiro dia → máximo. */
export function calcNewCards(rate: number | null, maxCards: number = 3): number {
  if (rate === null) return maxCards;
  return Math.min(maxCards, Math.max(0, Math.floor(maxCards * rate)));
}

// ── Cadência semanal decrescente (espelho de functions/cadenceUtils) ──────────

/** Dias da semana (1–7) em que caem `count` contatos de follow-up. */
export function contactDayOffsets(count: number): number[] {
  switch (count) {
    case 3:  return [2, 4, 6];
    case 2:  return [3, 6];
    case 1:  return [4];
    default:
      if (count <= 0) return [];
      return Array.from({ length: Math.min(count, 7) }, (_, i) =>
        1 + Math.round((i * 6) / Math.max(1, Math.min(count, 7) - 1)));
  }
}

/** Follow-up devido para um lead com N dias de fila (Semana 1 = dias 1–7...). */
export function followUpForDay(
  daysSinceAssigned: number,
  weeklyContacts: number[] = [3, 2, 1],
): { week: number; contactIndex: number } | null {
  if (daysSinceAssigned <= 0) return null;
  const week = Math.floor((daysSinceAssigned - 1) / 7);
  if (week >= weeklyContacts.length) return null;
  const dayInWeek = daysSinceAssigned - week * 7;
  const idx = contactDayOffsets(weeklyContacts[week]).indexOf(dayInWeek);
  if (idx === -1) return null;
  return { week: week + 1, contactIndex: idx + 1 };
}

/** Taxa de conclusão (0–1). Zero requeridas = 1 (não penaliza). */
export function calcCompletionRate(completed: number, required: number): number {
  if (required <= 0) return 1;
  return Math.min(1, completed / required);
}

/** Retorna a data atual em BRT (GMT-3) como "YYYY-MM-DD". */
export function getTodayBRT(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Ordem = prioridade de acompanhamento (cliente, jul/2026): ligação e LinkedIn primeiro.
export const SDR_ACTIVITY_TYPES: ActivityType[] = ['call', 'linkedin', 'whatsapp', 'email'];

// ── Alertas de agenda (Observações do cliente, jul/2026) ─────────────────────
// "Alerta na agenda para quando a atividade estiver atrasada e prestes a atrasar."

export interface AgendaAlertCounts {
  /** status 'overdue' OU pendente com vencimento no passado */
  overdue: number;
  /** pendente que vence hoje (prestes a atrasar) */
  dueToday: number;
}

export function classifyDueActivities(
  activities: Array<{ userId?: string; status?: string; dueAt?: any; scheduledAt?: any }>,
  uid: string,
  now: Date = new Date(),
): AgendaAlertCounts {
  const todayStr = getTodayBRT(now);
  let overdue = 0;
  let dueToday = 0;
  for (const a of activities) {
    if (a.userId !== uid) continue;
    const raw = a.dueAt ?? a.scheduledAt;
    const due: Date | null = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    if (a.status === 'overdue') { overdue++; continue; }
    if (a.status !== 'pending' || !due || isNaN(due.getTime())) continue;
    if (due.getTime() < now.getTime()) overdue++;
    else if (getTodayBRT(due) === todayStr) dueToday++;
  }
  return { overdue, dueToday };
}

// ── Agrupamento por bloco (Observações do cliente, jul/2026) ─────────────────
// "Todas as ligações do dia por bloco, todos os e-mails por bloco..."

export interface GroupedActivity {
  type: ActivityType;
  activityId?: string;
  status: CadenceActivity['status'];
  card: CadenceCard;
}

/**
 * Agrupa as atividades dos cards do dia por canal, na ordem de prioridade.
 * Dentro de cada bloco, pendentes vêm antes das concluídas.
 *
 * `channelOrder` (opcional): ordem dos blocos em si — normalmente vem da
 * sequência configurada em settings/cadence (`SequenceStep[]`, já ordenada).
 * Sem isso, cai na ordem legada fixa de `SDR_ACTIVITY_TYPES`.
 */
export function groupActivitiesByType(cards: CadenceCard[], channelOrder?: ActivityType[]): { type: ActivityType; items: GroupedActivity[] }[] {
  const order = channelOrder && channelOrder.length === SDR_ACTIVITY_TYPES.length ? channelOrder : SDR_ACTIVITY_TYPES;
  return order.map(type => {
    const items: GroupedActivity[] = [];
    for (const card of cards) {
      const act = card.activities[type];
      if (act) items.push({ type, activityId: act.activityId, status: act.status, card });
    }
    items.sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
    return { type, items };
  }).filter(g => g.items.length > 0);
}

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, { icon: string; label: string; color: string; bg: string }> = {
  email:    { icon: 'Mail',          label: 'Email',    color: '#1A6B1A', bg: '#E5F0E5' },
  linkedin: { icon: 'Linkedin',      label: 'LinkedIn', color: '#0077B5', bg: '#E8F4FD' },
  whatsapp: { icon: 'MessageCircle', label: 'WhatsApp', color: '#25D366', bg: '#DCFCE7' },
  call:     { icon: 'Phone',         label: 'Ligação',  color: '#F59E0B', bg: '#FEF3C7' },
};
