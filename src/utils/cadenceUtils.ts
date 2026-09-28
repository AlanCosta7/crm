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
}

export interface CadenceCard {
  dealId: string;
  contactName: string;
  companyName: string;
  productId?: string;
  isNew: boolean;
  /** Card de um passo tardio da régua (dayOffset > 0). */
  sequenceStep?: boolean;
  /** Rótulo do passo, ex.: "Ligação + LinkedIn" */
  sequenceLabel?: string;
  activities: Partial<Record<ActivityType, CadenceActivity>>;
}

// ── Régua de contato SDR (espelho de functions/cadenceUtils) ────────────────
// Editável pela gestão em settings/cadence.sdr.steps. A régua abaixo é o
// padrão do documento "Cadência Comercial SDRs do Dia 1 ao Dia 30" (confirmado
// com o Alan, 27/08/2026) — usada quando ainda não há régua configurada.

export interface CadenceStepDef {
  dayOffset: number;
  types: ActivityType[];
  label: string;
}

export const DEFAULT_SDR_CADENCE_STEPS: CadenceStepDef[] = [
  { dayOffset: 0,  types: ['call', 'email', 'linkedin'], label: 'Contato inicial' },
  { dayOffset: 1,  types: ['whatsapp'],                   label: 'WhatsApp' },
  { dayOffset: 3,  types: ['call', 'linkedin'],           label: 'Ligação + LinkedIn' },
  { dayOffset: 5,  types: ['email'],                      label: 'E-mail de benefício' },
  { dayOffset: 8,  types: ['call', 'whatsapp'],           label: 'Ligação + WhatsApp' },
  { dayOffset: 12, types: ['email'],                      label: 'E-mail com case' },
  { dayOffset: 17, types: ['call', 'linkedin'],           label: 'Ligação + LinkedIn' },
  { dayOffset: 23, types: ['whatsapp'],                   label: 'WhatsApp de validação' },
  { dayOffset: 29, types: ['call', 'email'],              label: 'Ligação + e-mail de encerramento' },
];

export function findCadenceStep(steps: CadenceStepDef[], dayOffset: number): CadenceStepDef | undefined {
  return steps.find(s => s.dayOffset === dayOffset);
}

const MAX_STEP_DAY_OFFSET = 90;
const MAX_STEP_LABEL_LEN = 60;

/** Normaliza settings/cadence.sdr.steps — mesma validação do backend (ver
 * functions/src/cadence/cadenceUtils.ts): offsets inteiros únicos (0–90), pelo
 * menos 1 canal por passo, e um passo em dayOffset 0. Inválido cai pro padrão. */
export function normalizeSteps(raw: unknown): CadenceStepDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SDR_CADENCE_STEPS;
  const validTypes = new Set<string>(SDR_ACTIVITY_TYPES);
  const seenOffsets = new Set<number>();
  const steps: CadenceStepDef[] = [];
  for (const item of raw as any[]) {
    const dayOffset = Number(item?.dayOffset);
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > MAX_STEP_DAY_OFFSET) return DEFAULT_SDR_CADENCE_STEPS;
    if (seenOffsets.has(dayOffset)) return DEFAULT_SDR_CADENCE_STEPS;
    const rawTypes: unknown[] = Array.isArray(item?.types) ? item.types : [];
    const types = Array.from(new Set(rawTypes)).filter((t): t is ActivityType => typeof t === 'string' && validTypes.has(t));
    if (types.length === 0) return DEFAULT_SDR_CADENCE_STEPS;
    const label = typeof item?.label === 'string' && item.label.trim()
      ? item.label.trim().slice(0, MAX_STEP_LABEL_LEN)
      : types.map(t => ACTIVITY_TYPE_CONFIG[t].label).join(' + ');
    seenOffsets.add(dayOffset);
    steps.push({ dayOffset, types, label });
  }
  if (!steps.some(s => s.dayOffset === 0)) return DEFAULT_SDR_CADENCE_STEPS;
  return steps.sort((a, b) => a.dayOffset - b.dayOffset);
}

export function dayOffsetLabel(n: number): string {
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  return `Em ${n} dias`;
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

/** Taxa de conclusão (0–1). Zero requeridas = 1 (não penaliza). */
export function calcCompletionRate(completed: number, required: number): number {
  if (required <= 0) return 1;
  return Math.min(1, completed / required);
}

/** Retorna a data atual em BRT (GMT-3) como "YYYY-MM-DD". */
export function getTodayBRT(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Dias corridos entre duas datas, medidos no calendário BRT (espelho de functions/cadenceUtils). */
export function daysBetweenBRT(from: Date, now: Date = new Date()): number {
  const [y1, m1, d1] = getTodayBRT(from).split('-').map(Number);
  const [y2, m2, d2] = getTodayBRT(now).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export interface AssignedDealForCadence {
  assignedAt: Date | null;
  handoffStatus?: unknown;
  standbyActive?: boolean;
}

/**
 * Decide quais canais de atividade faltam pro passo da régua devido HOJE pra
 * um deal atribuído ao SDR — usada por useCadencia (ensureTodaySteps) pra
 * montar a cadência na hora, sem esperar o motor automático (dailyCadenceEngine)
 * do dia seguinte. Função pura: não faz I/O, só decide.
 *
 * Retorna [] quando: o deal já passou o bastão ou está em Standby, não tem
 * `assignedAt`, hoje não é dia de contato pra ele, ou os canais do passo já
 * têm activity criada hoje.
 */
export function missingCadenceTypesForDeal(
  steps: CadenceStepDef[],
  deal: AssignedDealForCadence,
  existingTypesToday: Set<ActivityType>,
  now: Date = new Date(),
): ActivityType[] {
  if (deal.handoffStatus || deal.standbyActive) return [];
  if (!deal.assignedAt) return [];
  const days = daysBetweenBRT(deal.assignedAt, now);
  if (days < 0) return [];
  const step = findCadenceStep(steps, days);
  if (!step) return [];
  return step.types.filter(t => !existingTypesToday.has(t));
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
 * Agrupa as atividades dos cards do dia por canal, na ordem de prioridade
 * fixa de `SDR_ACTIVITY_TYPES`. Dentro de cada bloco, pendentes vêm antes das
 * concluídas.
 */
export function groupActivitiesByType(cards: CadenceCard[]): { type: ActivityType; items: GroupedActivity[] }[] {
  return SDR_ACTIVITY_TYPES.map(type => {
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
