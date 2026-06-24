/**
 * crmFormat.ts — Utilitários de formatação e lookup do WizMart CRM
 *
 * Todas as funções são puras (sem efeitos colaterais) e totalmente testáveis.
 * Testes em: src/utils/crmFormat.test.ts
 */

import type { Seller, Stage, UserRole, ProductId } from '../types/crm';

// ── Moeda ──────────────────────────────────────────────────────────────────────

/** Formata um número como moeda BRL. Ex: 1500 → "R$ 1.500" */
export function fmtCurrency(n: any): string {
  if (n === undefined || n === null) return 'R$ 0';
  let num = typeof n === 'number' ? n : parseFloat(n);
  if (isNaN(num)) num = 0;
  return 'R$ ' + num.toLocaleString('pt-BR');
}

/** Formata moeda BRL compacta. Ex: 1_500_000 → "R$ 1,5M" | 32_000 → "R$ 32K" */
export function fmtCurrencyCompact(n: any): string {
  if (n === undefined || n === null) return 'R$ 0';
  let num = typeof n === 'number' ? n : parseFloat(n);
  if (isNaN(num)) num = 0;
  if (num >= 1_000_000) return `R$ ${(num / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (num >= 1_000)     return `R$ ${(num / 1_000).toFixed(0)}K`;
  return fmtCurrency(num);
}

// ── Lookups ────────────────────────────────────────────────────────────────────

const UNKNOWN_SELLER: Seller = { id: 'unknown', name: 'Desconhecido', initials: '??', color: '#6B7280' };
const UNKNOWN_STAGE:  Stage  = { id: 'unknown', name: 'Desconhecido' };

/** Retorna o seller pelo ID, ou um placeholder seguro se não encontrado. */
export function sellerById(sellersList: Seller[], id: string): Seller {
  if (!id) return UNKNOWN_SELLER;
  return sellersList.find(s => s.id === id) ?? UNKNOWN_SELLER;
}

/** Retorna o estágio pelo ID, ou um placeholder seguro se não encontrado. */
export function stageById(stagesList: Stage[], id: string): Stage {
  if (!id) return UNKNOWN_STAGE;
  return stagesList.find(s => s.id === id) ?? UNKNOWN_STAGE;
}

// ── Datas e períodos ───────────────────────────────────────────────────────────

/** Retorna a chave do período atual no formato "YYYY-MM". */
export function currentPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Retorna a chave do ciclo trimestral atual. Ex: "Q2-2026" */
export function currentCycleKey(): string {
  const d = new Date();
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${quarter}-${d.getFullYear()}`;
}

/**
 * Formata um timestamp Firestore (com .toDate()) ou Date para string legível.
 * Ex: "29 mai · 14:30"
 */
export function fmtTimestamp(ts: any): string {
  if (!ts) return '—';
  const date: Date = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Calcula dias úteis (seg–sex) entre hoje e uma data alvo.
 * Valores negativos indicam atraso.
 */
export function businessDaysUntil(targetDate: Date, fromDate = new Date()): number {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  let count = 0;
  const step = target >= from ? 1 : -1;
  const cursor = new Date(from);

  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + step);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count += step;
  }
  return count;
}

// ── Roles e Produtos ───────────────────────────────────────────────────────────

export const ROLE_LABEL: Record<UserRole, string> = {
  master:  'Admin Master',
  manager: 'Gestor',
  bdr:     'BDR',
  sdr:     'SDR',
  rep:     'Representante',
  viewer:  'Visualizador',
};

export const PRODUCT_LABEL: Record<ProductId, string> = {
  wizmart:    'WizMart',
  smart_cafe: 'Smart Café',
};

export const PRODUCT_COLOR: Record<ProductId, { primary: string; accent: string }> = {
  wizmart:    { primary: '#1A6B1A', accent: '#8DB600' },
  smart_cafe: { primary: '#92400E', accent: '#D97706' },
};

/** Verifica se o role pode criar deals (BDR ou acima). */
export function canCreateDeal(role: UserRole): boolean {
  return ['master', 'manager', 'bdr'].includes(role);
}

/** Verifica se o role pode ver KPIs do time completo. */
export function canViewTeamKPIs(role: UserRole): boolean {
  return ['master', 'manager', 'viewer'].includes(role);
}

/** Verifica se o role pode configurar funis e estágios. */
export function canConfigureFunnels(role: UserRole): boolean {
  return ['master', 'manager'].includes(role);
}

// ── Conclusão e taxas ──────────────────────────────────────────────────────────

/**
 * Calcula a taxa de conclusão (0–1) com segurança contra divisão por zero.
 * @example completionRate(3, 4) → 0.75
 */
export function completionRate(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(completed / total, 1);
}

/** Formata uma taxa como porcentagem. Ex: 0.753 → "75.3%" */
export function fmtRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Calcula novos cards SDR baseado na fórmula da cadência.
 * Fórmula: Math.floor(3 × taxaConclusaoOntem), mínimo 0, máximo 3.
 */
export function calcCadenceCards(completionRateYesterday: number): number {
  return Math.min(3, Math.max(0, Math.floor(3 * completionRateYesterday)));
}

// ── Iniciais ───────────────────────────────────────────────────────────────────

/** Gera iniciais de até 2 letras a partir de um nome completo. */
export function initialsFromName(name: string): string {
  if (!name?.trim()) return '??';
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}
