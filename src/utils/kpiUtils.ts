/**
 * kpiUtils.ts — Utilitários puros para cálculo e exibição de KPIs
 *
 * Todas as funções são puras (sem I/O) e totalmente testáveis.
 * Testes em: src/utils/kpiUtils.test.ts
 *
 * Fonte dos dados: kpi_snapshots/{role}:{userId}:{productId}:{periodType}:{period}
 */

import type { Deal, Activity, ActivityType } from '../types/crm';

// ── Tipos de período ──────────────────────────────────────────────────────────

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface PeriodOption {
  key:   PeriodType;
  label: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'daily',     label: 'Hoje'       },
  { key: 'weekly',    label: 'Esta semana'},
  { key: 'monthly',   label: 'Este mês'   },
  { key: 'quarterly', label: 'Trimestre'  },
];

// ── Funnel de conversão ───────────────────────────────────────────────────────

export interface FunnelStageKPI {
  name:       string;
  count:      number;
  value:      number;
  conversion: number; // taxa de conversão para o próximo estágio (0–1)
}

/**
 * Calcula o funil de conversão a partir dos deals.
 * Retorna os estágios ordenados com contagem, valor total e taxa de conversão.
 */
export function calcFunnelConversion(
  deals: Pick<Deal, 'stage' | 'value' | 'status'>[],
  stages: { id: string; name: string; order: number }[],
): FunnelStageKPI[] {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const result: FunnelStageKPI[] = sorted.map(st => {
    const stDeals = deals.filter(d => d.stage === st.id);
    return {
      name:       st.name,
      count:      stDeals.length,
      value:      stDeals.reduce((s, d) => s + d.value, 0),
      conversion: 0, // calculado abaixo
    };
  });

  // Taxa de conversão: count[i+1] / count[i]
  for (let i = 0; i < result.length - 1; i++) {
    result[i].conversion = result[i].count > 0
      ? result[i + 1].count / result[i].count
      : 0;
  }
  // Último estágio: taxa é de ganhos / total no estágio
  const wonDeals = deals.filter(d => d.status === 'won').length;
  const lastIdx  = result.length - 1;
  if (lastIdx >= 0 && result[lastIdx].count > 0) {
    result[lastIdx].conversion = wonDeals / result[lastIdx].count;
  }

  return result;
}

// ── Cálculo de métricas SDR ───────────────────────────────────────────────────

export interface SDRMetrics {
  totalActivities:    number;
  byType:             Partial<Record<ActivityType, number>>;
  completionRate:     number;
  meetingsScheduled:  number;
  visitsScheduled:    number;
  overdueCount:       number;
}

/**
 * Agrega as métricas SDR a partir de uma lista de atividades.
 */
export function calcSDRMetrics(
  activities: Pick<Activity, 'type' | 'status' | 'cadenceType'>[],
): SDRMetrics {
  const sdrActivities = activities.filter(a => a.cadenceType === 'sdr_daily');
  const completed  = sdrActivities.filter(a => a.status === 'completed');
  const overdue    = sdrActivities.filter(a => a.status === 'overdue');

  const byType: Partial<Record<ActivityType, number>> = {};
  for (const act of completed) {
    byType[act.type] = (byType[act.type] || 0) + 1;
  }

  return {
    totalActivities:   sdrActivities.length,
    byType,
    completionRate:    sdrActivities.length > 0
      ? completed.length / sdrActivities.length
      : 0,
    meetingsScheduled: completed.filter(a => a.type === 'meeting').length,
    visitsScheduled:   completed.filter(a => a.type === 'visit').length,
    overdueCount:      overdue.length,
  };
}

// ── Cálculo de métricas Rep ───────────────────────────────────────────────────

export interface RepMetrics {
  visitsDone:          number;
  proposalsPresented:  number;
  contractsSigned:     number;
  revenue:             number;
  avgDealValue:        number;
  overdueCount:        number;
  completionRate:      number;
}

/**
 * Agrega as métricas do Representante a partir de deals e atividades.
 */
export function calcRepMetrics(
  deals: Pick<Deal, 'status' | 'value'>[],
  activities: Pick<Activity, 'type' | 'status' | 'cadenceType'>[],
): RepMetrics {
  const repActivities = activities.filter(a => a.cadenceType === 'rep_followup');
  const completed     = repActivities.filter(a => a.status === 'completed');
  const wonDeals      = deals.filter(d => d.status === 'won');

  return {
    visitsDone:         completed.filter(a => a.type === 'visit').length,
    proposalsPresented: completed.filter(a => a.type === 'proposal').length,
    contractsSigned:    wonDeals.length,
    revenue:            wonDeals.reduce((s, d) => s + d.value, 0),
    avgDealValue:       wonDeals.length > 0
      ? wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length
      : 0,
    overdueCount:       repActivities.filter(a => a.status === 'overdue').length,
    completionRate:     repActivities.length > 0
      ? completed.length / repActivities.length
      : 0,
  };
}

// ── Ranking e comparativos ────────────────────────────────────────────────────

export interface UserRankEntry {
  userId:    string;
  name:      string;
  initials:  string;
  color:     string;
  value:     number;
  secondary?: number;
}

/**
 * Gera um ranking de usuários por valor (descendente).
 * Usado para comparativos entre SDRs ou Reps.
 */
export function buildRanking(entries: UserRankEntry[]): UserRankEntry[] {
  return [...entries].sort((a, b) => b.value - a.value);
}

// ── Formatação de KPI ─────────────────────────────────────────────────────────

/**
 * Formata uma taxa como string percentual com 1 decimal.
 * @example fmtKpiRate(0.753) → "75.3%"
 */
export function fmtKpiRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Calcula a variação percentual entre dois valores.
 * @returns Valor entre -100 e +∞. Positivo = crescimento.
 */
export function calcGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Retorna o sinal + ou − para exibição de variação.
 */
export function growthSign(growth: number): string {
  return growth >= 0 ? '+' : '';
}

/**
 * Formata crescimento como string com sinal e 1 decimal.
 * @example fmtGrowth(12.3) → "+12.3%" | fmtGrowth(-5.1) → "-5.1%"
 */
export function fmtGrowth(growth: number): string {
  return `${growthSign(growth)}${growth.toFixed(1)}%`;
}

// ── Seletor de produto para KPIs ──────────────────────────────────────────────

/**
 * Filtra deals por produto. Se productId for 'all', retorna todos.
 */
export function filterDealsByProduct<T extends { productId?: string }>(
  deals: T[],
  productId: string,
): T[] {
  if (productId === 'all' || !productId) return deals;
  return deals.filter(d => d.productId === productId);
}

// ── SLA e atrasos ─────────────────────────────────────────────────────────────

/**
 * Verifica se um percentual de atraso é crítico (> 20% das atividades em overdue).
 */
export function isOverdueRateCritical(overdueCount: number, totalCount: number): boolean {
  if (totalCount === 0) return false;
  return overdueCount / totalCount > 0.20;
}
