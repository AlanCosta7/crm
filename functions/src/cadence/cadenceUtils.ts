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
  /** Card de um passo tardio da régua fixa (dayOffset > 0), disparado no dia certo. */
  sequenceStep?: boolean;
  /** Rótulo do passo, ex.: "Ligação + LinkedIn" */
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

// ── Régua de contato SDR — editável pela gestão em settings/cadence.sdr.steps ─
// Documento "Cadência Comercial SDRs do Dia 1 ao Dia 30" (confirmado com o
// Alan, 27/08/2026) define a régua padrão abaixo; master/manager podem
// reconfigurá-la em Configurações → Cadência (pedido do Alan, 27/08/2026).
// Sequência configurável (offsets 0–3) e a régua semanal decrescente (3→2→1)
// que existiam antes foram substituídas por esta régua de passos livres.
//
// D+23 do documento diz "WhatsApp ou e-mail de validação" (dá a escolha ao
// SDR); o padrão fixa WhatsApp, já que e-mail já aparece nos passos D+5/D+12/D+29.
// "Pesquisa" do D0 não vira uma activity rastreável — é preparo do SDR antes
// de ligar, não um canal de contato como os outros 4.

export interface CadenceStepDef {
  /** Dias corridos desde a distribuição do card (0 = dia da distribuição). */
  dayOffset: number;
  /** Canal(is) tocado(s) nesse dia — mais de um quando o passo combina ações. */
  types: ActivityType[];
  /** Rótulo exibido pro SDR (badge do card). */
  label: string;
}

/** Régua padrão (documento "Cadência Comercial SDRs do Dia 1 ao Dia 30"), usada
 * quando a gestão ainda não configurou uma régua própria, ou como fallback de
 * segurança se a configurada estiver inválida. */
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

/** Passo da régua que vence no dia informado, ou undefined se não é dia de contato. */
export function findCadenceStep(steps: CadenceStepDef[], dayOffset: number): CadenceStepDef | undefined {
  return steps.find(s => s.dayOffset === dayOffset);
}

/** Máximo de dias corridos que um passo da régua pode levar (~3 meses). */
const MAX_STEP_DAY_OFFSET = 90;
const MAX_STEP_LABEL_LEN = 60;

/** Normaliza settings/cadence.sdr.steps — exige offsets inteiros únicos (0–90),
 * pelo menos 1 canal válido por passo e um passo em dayOffset 0 (contato
 * inicial ao distribuir o card). Qualquer coisa inválida cai pra régua padrão
 * do documento, pra nunca deixar o motor sem régua. */
function normalizeSteps(raw: any): CadenceStepDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SDR_CADENCE_STEPS;
  const validTypes = new Set<string>(SDR_ACTIVITY_TYPES);
  const seenOffsets = new Set<number>();
  const steps: CadenceStepDef[] = [];
  for (const item of raw) {
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

// ── Configuração de cadência (editável pela gestão em settings/cadence) ──────

export interface CadenceConfig {
  /** Máximo de cards novos por dia para o SDR (padrão 3) */
  newCardsPerDay: number;
  /** SLA em dias úteis para o 1º contato do Rep após aceitar handoff (padrão 3) */
  repFirstContactBusinessDays: number;
  /** Régua de contato do SDR (dias e canais desde a distribuição do card). */
  steps: CadenceStepDef[];
}

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  newCardsPerDay: 3,
  repFirstContactBusinessDays: 3,
  steps: DEFAULT_SDR_CADENCE_STEPS,
};

/** Normaliza o doc settings/cadence (parcial/ausente) em uma config válida. */
export function normalizeCadenceConfig(raw: any): CadenceConfig {
  const clamp = (v: any, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
  };
  return {
    newCardsPerDay: clamp(raw?.sdr?.newCardsPerDay, 0, 10, DEFAULT_CADENCE_CONFIG.newCardsPerDay),
    repFirstContactBusinessDays: clamp(raw?.rep?.firstContactBusinessDays, 1, 15, DEFAULT_CADENCE_CONFIG.repFirstContactBusinessDays),
    steps: normalizeSteps(raw?.sdr?.steps),
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
