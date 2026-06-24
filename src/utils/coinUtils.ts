/**
 * coinUtils.ts — Utilitários puros do Sistema de Moedas WizMart CRM
 *
 * Todas as funções são puras (sem I/O) e totalmente testáveis.
 * Testes em: src/utils/coinUtils.test.ts
 *
 * Regras de negócio (REQUISITOS-V2.md §8):
 *  - Ciclo trimestral: Q1 jan-mar, Q2 abr-jun, Q3 jul-set, Q4 out-dez
 *  - Alerta de "Feira Digital" quando faltam ≤ 15 dias para o fim do ciclo
 *  - Moedas não expiram (acumulam para o próximo ciclo)
 *  - Ledger imutável: cada transação é append-only
 */

import type { CoinTransaction, CoinEventType } from '../types/crm';

// ── Ciclo Trimestral ──────────────────────────────────────────────────────────

export interface CycleInfo {
  key:       string;   // "Q2-2026"
  label:     string;   // "2º Trimestre de 2026"
  quarter:   number;   // 1–4
  year:      number;
  startDate: Date;
  endDate:   Date;
}

/**
 * Retorna a chave do ciclo atual. Ex: "Q2-2026"
 */
export function getCurrentCycleKey(now: Date = new Date()): string {
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${quarter}-${now.getFullYear()}`;
}

/**
 * Retorna informações completas do ciclo trimestral atual.
 */
export function getCurrentCycleInfo(now: Date = new Date()): CycleInfo {
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const year    = now.getFullYear();
  const key     = `Q${quarter}-${year}`;

  const startMonth = (quarter - 1) * 3; // jan=0, abr=3, jul=6, out=9
  const endMonth   = startMonth + 2;

  const startDate = new Date(year, startMonth, 1);
  const endDate   = new Date(year, endMonth + 1, 0, 23, 59, 59); // último dia do mês

  const quarterOrdinal = ['1º', '2º', '3º', '4º'][quarter - 1];
  const label = `${quarterOrdinal} Trimestre de ${year}`;

  return { key, label, quarter, year, startDate, endDate };
}

/**
 * Retorna informações de um ciclo específico pela chave. Ex: "Q2-2026"
 */
export function getCycleInfoByKey(key: string): CycleInfo | null {
  const match = key.match(/^Q([1-4])-(\d{4})$/);
  if (!match) return null;
  const quarter = parseInt(match[1]);
  const year    = parseInt(match[2]);
  const fakeDate = new Date(year, (quarter - 1) * 3 + 1, 15); // meio do trimestre
  return getCurrentCycleInfo(fakeDate);
}

/**
 * Retorna quantos dias restam até o fim do ciclo atual.
 */
export function daysUntilCycleEnd(now: Date = new Date()): number {
  const cycle   = getCurrentCycleInfo(now);
  const diffMs  = cycle.endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Verifica se a "Feira Digital" está se aproximando (≤ 15 dias para o fim do ciclo).
 */
export function isFairApproaching(now: Date = new Date(), thresholdDays = 15): boolean {
  return daysUntilCycleEnd(now) <= thresholdDays;
}

// ── Cálculo de saldo ──────────────────────────────────────────────────────────

/**
 * Calcula o saldo de moedas a partir de uma lista de transações do ledger.
 * Transações positivas = ganhos, negativas = resgates.
 */
export function calcCoinBalance(transactions: Pick<CoinTransaction, 'amount'>[]): number {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Calcula o total de moedas ganhas em um ciclo específico.
 */
export function calcCoinsEarnedInCycle(
  transactions: Pick<CoinTransaction, 'amount' | 'cycle'>[],
  cycleKey: string,
): number {
  return transactions
    .filter(tx => tx.cycle === cycleKey && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Calcula o total de moedas resgatadas em um ciclo específico.
 */
export function calcCoinsRedeemedInCycle(
  transactions: Pick<CoinTransaction, 'amount' | 'cycle'>[],
  cycleKey: string,
): number {
  return transactions
    .filter(tx => tx.cycle === cycleKey && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

// ── Formatação ────────────────────────────────────────────────────────────────

/**
 * Formata um valor de moedas com pluralização.
 * @example formatCoins(1) → "1 moeda" | formatCoins(42) → "42 moedas"
 */
export function formatCoins(n: number): string {
  return `${n} ${n === 1 ? 'moeda' : 'moedas'}`;
}

/**
 * Retorna o label amigável de um tipo de evento de moeda.
 */
export function getCoinEventLabel(type: CoinEventType): string {
  const labels: Record<CoinEventType, string> = {
    activity_ontime:     'Atividade concluída no prazo',
    meeting_scheduled:   'Reunião agendada',
    visit_scheduled:     'Visita agendada',
    visit_done:          'Visita realizada',
    proposal_presented:  'Proposta apresentada',
    contract_signed:     'Contrato assinado',
    pdv_3k:              'PDV faturou acima de R$ 3.000',
    pdv_10k:             'PDV faturou acima de R$ 10.000',
    pdv_20k:             'PDV faturou acima de R$ 20.000',
    redemption:          'Resgate de prêmio',
    admin_adjustment:    'Ajuste administrativo',
  };
  return labels[type] ?? type;
}

/**
 * Retorna o ícone e cor para um tipo de evento de moeda.
 */
export function getCoinEventStyle(type: CoinEventType): { icon: string; color: string; isPositive: boolean } {
  const positive = type !== 'redemption';
  const styles: Partial<Record<CoinEventType, { icon: string; color: string }>> = {
    activity_ontime:    { icon: 'CheckCircle2', color: '#1A6B1A' },
    meeting_scheduled:  { icon: 'Calendar',     color: '#0E7490' },
    visit_scheduled:    { icon: 'MapPin',        color: '#7C3AED' },
    visit_done:         { icon: 'MapPin',        color: '#7C3AED' },
    proposal_presented: { icon: 'FileText',      color: '#B91C1C' },
    contract_signed:    { icon: 'FileCheck',     color: '#1A6B1A' },
    pdv_3k:             { icon: 'TrendingUp',    color: '#F59E0B' },
    pdv_10k:            { icon: 'TrendingUp',    color: '#F59E0B' },
    pdv_20k:            { icon: 'TrendingUp',    color: '#F59E0B' },
    redemption:         { icon: 'ShoppingBag',   color: '#EF4444' },
    admin_adjustment:   { icon: 'Settings',      color: '#6B7280' },
  };
  const style = styles[type] ?? { icon: 'Coins', color: '#D97706' };
  return { ...style, isPositive: positive };
}

// ── Validação de resgate ──────────────────────────────────────────────────────

export interface RedeemValidation {
  canRedeem: boolean;
  reason?: string;
}

/**
 * Verifica se o usuário pode resgatar um prêmio.
 *
 * @param coinBalance Saldo atual do usuário
 * @param coinCost Custo do prêmio em moedas
 * @param stock Estoque disponível (-1 = ilimitado)
 */
export function validateRedemption(
  coinBalance: number,
  coinCost: number,
  stock: number,
): RedeemValidation {
  if (coinBalance < coinCost) {
    return {
      canRedeem: false,
      reason: `Saldo insuficiente. Você tem ${formatCoins(coinBalance)} e precisa de ${formatCoins(coinCost)}.`,
    };
  }
  if (stock === 0) {
    return { canRedeem: false, reason: 'Prêmio esgotado.' };
  }
  return { canRedeem: true };
}

// ── Tabela de premiação ───────────────────────────────────────────────────────

/** Moedas por tipo de evento (conforme REQUISITOS-V2.md §8) */
export const COIN_REWARDS: Partial<Record<CoinEventType, number>> = {
  activity_ontime:    1,
  meeting_scheduled:  1,
  visit_scheduled:    1,
  visit_done:         1,
  proposal_presented: 1,
  contract_signed:    1,
  pdv_3k:             3,
  pdv_10k:            5,
  pdv_20k:            10,
};

/**
 * Retorna quantas moedas são premiadas por um tipo de evento.
 */
export function getCoinsForEvent(type: CoinEventType): number {
  return COIN_REWARDS[type] ?? 0;
}

/**
 * Regra de acumulação para PDVs:
 * O milestone mais alto atingido paga apenas aquele (não acumula).
 * Ex: PDV de R$25.000 → paga 10 moedas (pdv_20k), não 3+5+10.
 */
export function getMilestoneCoinEvent(amountBRL: number): CoinEventType | null {
  if (amountBRL >= 20000) return 'pdv_20k';
  if (amountBRL >= 10000) return 'pdv_10k';
  if (amountBRL >= 3000)  return 'pdv_3k';
  return null;
}
