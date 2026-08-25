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
  /** Posição na sequência configurada pelo admin (ordem de exibição/execução sugerida). */
  sequenceOrder?: number;
}

export interface CadenceCard {
  dealId: string;
  contactName: string;
  companyName: string;
  productId: string;
  isNew: boolean; // card distribuído hoje vs carry-over de ontem
  /** Card de follow-up da cadência semanal decrescente (1 contato) */
  followUp?: boolean;
  /** Rótulo do follow-up, ex.: "Semana 2 · contato 1" */
  weekLabel?: string;
  /** Card de um passo tardio da sequência de contato (dayOffset > 0), disparado no dia certo. */
  sequenceStep?: boolean;
  /** Rótulo do passo de sequência, ex.: "Sequência · WhatsApp" */
  sequenceLabel?: string;
  activities: Partial<Record<ActivityType, CadenceActivity>>;
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

// ── Sequência de contato dos cards novos (Plano de 24/08/2026) ───────────────
// Configurável pelo admin master em settings/cadence.sdr.sequence — instrui os
// SDRs em que dia/período de cada card novo enviar cada canal (ex.: e-mail e
// ligação hoje de manhã, LinkedIn hoje à tarde, WhatsApp amanhã no fim do dia).
// Sequência vazia (`[]`) = comportamento legado: os 4 canais no dia 0, sem
// período (dueAt = hoje 23:59), na ordem fixa de SDR_ACTIVITY_TYPES.

export type Period = 'manha' | 'tarde' | 'fim_dia';

export interface SequenceStep {
  type: ActivityType;
  /** 0 = mesmo dia da distribuição do card, 1 = dia seguinte, etc. (0–3) */
  dayOffset: number;
  period: Period;
}

export interface PeriodTimes {
  manha: string;   // "HH:mm", padrão "09:00"
  tarde: string;   // padrão "13:00"
  fim_dia: string; // padrão "18:00"
}

export const DEFAULT_PERIOD_TIMES: PeriodTimes = {
  manha: '09:00',
  tarde: '13:00',
  fim_dia: '18:00',
};

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Calcula o instante (Date/UTC) de um período num dia BRT específico. Brasil
 * não tem mais horário de verão desde 2019 — BRT = UTC-3 o ano inteiro, então
 * somar 3h ao horário de parede BRT dá o instante UTC correto sem lib de fuso. */
export function periodTimeOnDay(period: Period, periodTimes: PeriodTimes, dayBRT: string): Date {
  const [y, m, d] = dayBRT.split('-').map(Number);
  const raw = periodTimes[period] || DEFAULT_PERIOD_TIMES[period];
  const [hh, mm] = HHMM_RE.test(raw) ? raw.split(':').map(Number) : DEFAULT_PERIOD_TIMES[period].split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

/** Filtra os steps de uma sequência que caem num determinado dayOffset, preservando a ordem configurada. */
export function stepsForDayOffset(sequence: SequenceStep[], dayOffset: number): SequenceStep[] {
  return sequence.filter(s => s.dayOffset === dayOffset);
}

// ── Configuração de cadência (editável pela gestão em settings/cadence) ──────

export interface CadenceConfig {
  /** Máximo de cards novos por dia para o SDR (padrão 3) */
  newCardsPerDay: number;
  /** Contatos de follow-up por semana de vida do lead na fila (padrão [3, 2, 1]) */
  weeklyContacts: number[];
  /** SLA em dias úteis para o 1º contato do Rep após aceitar handoff (padrão 3) */
  repFirstContactBusinessDays: number;
  /** Sequência configurável dos 4 canais do blitz de um card novo. Vazio = comportamento legado. */
  sequence: SequenceStep[];
  /** Horários dos períodos manhã/tarde/fim do dia, usados pela sequência acima. */
  periodTimes: PeriodTimes;
}

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  newCardsPerDay: 3,
  weeklyContacts: [3, 2, 1],
  repFirstContactBusinessDays: 3,
  sequence: [],
  periodTimes: DEFAULT_PERIOD_TIMES,
};

const VALID_PERIODS: Period[] = ['manha', 'tarde', 'fim_dia'];

/** Normaliza settings/cadence.sdr.sequence — só aceita uma sequência com exatamente
 * os 4 canais existentes (sem duplicar, sem faltar nenhum); qualquer coisa inválida
 * cai pro padrão legado ([]), pra nunca deixar um card sem todos os canais. */
function normalizeSequence(raw: any): SequenceStep[] {
  if (!Array.isArray(raw) || raw.length !== SDR_ACTIVITY_TYPES.length) return [];
  const seen = new Set<ActivityType>();
  const steps: SequenceStep[] = [];
  for (const item of raw) {
    const type = item?.type;
    const dayOffset = Number(item?.dayOffset);
    const period = item?.period;
    if (!SDR_ACTIVITY_TYPES.includes(type)) return [];
    if (seen.has(type)) return [];
    if (!Number.isFinite(dayOffset) || dayOffset < 0 || dayOffset > 3 || !Number.isInteger(dayOffset)) return [];
    if (!VALID_PERIODS.includes(period)) return [];
    seen.add(type);
    steps.push({ type, dayOffset, period });
  }
  return steps;
}

function normalizePeriodTimes(raw: any): PeriodTimes {
  const pick = (key: Period) => (typeof raw?.[key] === 'string' && HHMM_RE.test(raw[key])) ? raw[key] : DEFAULT_PERIOD_TIMES[key];
  return { manha: pick('manha'), tarde: pick('tarde'), fim_dia: pick('fim_dia') };
}

/** Normaliza o doc settings/cadence (parcial/ausente) em uma config válida. */
export function normalizeCadenceConfig(raw: any): CadenceConfig {
  const clamp = (v: any, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
  };
  const weekly = Array.isArray(raw?.sdr?.weeklyContacts) && raw.sdr.weeklyContacts.length > 0
    ? raw.sdr.weeklyContacts.map((c: any) => clamp(c, 0, 7, 0))
    : DEFAULT_CADENCE_CONFIG.weeklyContacts;
  return {
    newCardsPerDay: clamp(raw?.sdr?.newCardsPerDay, 0, 10, DEFAULT_CADENCE_CONFIG.newCardsPerDay),
    weeklyContacts: weekly,
    repFirstContactBusinessDays: clamp(raw?.rep?.firstContactBusinessDays, 1, 15, DEFAULT_CADENCE_CONFIG.repFirstContactBusinessDays),
    sequence: normalizeSequence(raw?.sdr?.sequence),
    periodTimes: normalizePeriodTimes(raw?.sdr?.periodTimes),
  };
}

// ── Fórmula principal ─────────────────────────────────────────────────────────

/**
 * Calcula quantos novos cards o SDR receberá hoje.
 * @param rate Taxa de conclusão de ontem (0–1). null = primeiro dia.
 * @param maxCards Máximo diário (configurável; padrão 3).
 * @returns Número de cards (0–maxCards)
 */
export function calcNewCards(rate: number | null, maxCards: number = 3): number {
  if (rate === null) return maxCards; // Primeiro dia: recebe o máximo (taxa padrão = 1.0)
  return Math.min(maxCards, Math.max(0, Math.floor(maxCards * rate)));
}

// ── Cadência semanal decrescente (Observações do cliente, jul/2026) ──────────
// Semana 1 do lead na fila: 3 contatos · Semana 2: 2 · Semana 3: 1.
// O dia 0 (distribuição) tem o blitz de 4 canais; os follow-ups são contatos
// únicos nos dias marcados de cada semana.

/** Dias da semana (1–7, relativos ao início da semana) em que caem `count` contatos. */
export function contactDayOffsets(count: number): number[] {
  switch (count) {
    case 3:  return [2, 4, 6];
    case 2:  return [3, 6];
    case 1:  return [4];
    default:
      if (count <= 0) return [];
      // >3 contatos: distribui uniformemente nos dias 1–7
      return Array.from({ length: Math.min(count, 7) }, (_, i) =>
        1 + Math.round((i * 6) / Math.max(1, Math.min(count, 7) - 1)));
  }
}

/**
 * Retorna o follow-up devido para um lead com `daysSinceAssigned` dias de fila,
 * ou null se hoje não é dia de contato (ou a régua acabou).
 * Semana 1 = dias 1–7 · Semana 2 = dias 8–14 · Semana 3 = dias 15–21.
 */
export function followUpForDay(
  daysSinceAssigned: number,
  weeklyContacts: number[] = DEFAULT_CADENCE_CONFIG.weeklyContacts,
): { week: number; contactIndex: number } | null {
  if (daysSinceAssigned <= 0) return null;
  const week = Math.floor((daysSinceAssigned - 1) / 7); // 0-based
  if (week >= weeklyContacts.length) return null;
  const dayInWeek = daysSinceAssigned - week * 7; // 1..7
  const idx = contactDayOffsets(weeklyContacts[week]).indexOf(dayInWeek);
  if (idx === -1) return null;
  return { week: week + 1, contactIndex: idx + 1 };
}

/** Canal do follow-up: rotaciona pela prioridade (ligação → LinkedIn → WhatsApp). */
export function followUpChannel(week: number, contactIndex: number, weeklyContacts: number[] = DEFAULT_CADENCE_CONFIG.weeklyContacts): ActivityType {
  const priorityRotation: ActivityType[] = ['call', 'linkedin', 'whatsapp'];
  let contactsBefore = 0;
  for (let w = 0; w < week - 1 && w < weeklyContacts.length; w++) {
    contactsBefore += contactDayOffsets(weeklyContacts[w]).length;
  }
  return priorityRotation[(contactsBefore + contactIndex - 1) % priorityRotation.length];
}

/** Dias corridos entre duas datas, medidos no calendário BRT. */
export function daysBetweenBRT(from: Date, now: Date = new Date()): number {
  const [y1, m1, d1] = getTodayBRT(from).split('-').map(Number);
  const [y2, m2, d2] = getTodayBRT(now).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
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

// Ordem = prioridade de acompanhamento (cliente, jul/2026): ligação e LinkedIn primeiro.
export const SDR_ACTIVITY_TYPES: ActivityType[] = ['call', 'linkedin', 'whatsapp', 'email'];

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

// ── Distribuição balanceada por porte (Fase D3 do plano de assinaturas) ──────

export type CompanySize = "P" | "M" | "G";

export interface SizedCandidate {
  size: CompanySize;
}

/**
 * Escolhe `count` candidatos de `candidatesInRecencyOrder` (já ordenados do
 * mais recente pro mais antigo) priorizando, a cada vaga, o porte em que
 * `currentBySize` está mais defasado pro SDR que está recebendo. Dentro do
 * porte escolhido, mantém a ordem de recência recebida. Empate de defasagem
 * resolvido por P > M > G (equilibra as contas pequenas primeiro — mais
 * numerosas na fila em geral). Se não houver candidato do porte preferido,
 * cai pro próximo porte mais defasado; se nenhuma preferência tiver
 * candidato, pega o próximo por recência pura — nunca deixa vaga vazia só
 * por falta de um porte específico.
 *
 * Função pura — não faz I/O, só decide QUAIS candidatos (já buscados) usar.
 */
export function pickBalancedCandidates<T extends SizedCandidate>(
  candidatesInRecencyOrder: T[],
  count: number,
  currentBySize: Record<CompanySize, number>,
): T[] {
  const bySize: Record<CompanySize, number> = { ...currentBySize };
  let remaining = candidatesInRecencyOrder.slice();
  const picked: T[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const preference = (["P", "M", "G"] as CompanySize[])
      .slice()
      .sort((a, b) => bySize[a] - bySize[b]);
    const chosen = preference.map(size => remaining.find(c => c.size === size)).find(Boolean) ?? remaining[0];
    picked.push(chosen);
    remaining = remaining.filter(c => c !== chosen);
    bySize[chosen.size] += 1;
  }
  return picked;
}
