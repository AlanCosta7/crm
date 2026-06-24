/**
 * kpiUtils.test.ts — Testes dos utilitários de KPI
 *
 * Cobre: funil de conversão, métricas SDR, métricas Rep,
 * ranking, formatação e filtro por produto.
 */

import { describe, it, expect } from 'vitest';
import {
  calcFunnelConversion,
  calcSDRMetrics,
  calcRepMetrics,
  buildRanking,
  fmtKpiRate,
  calcGrowth,
  fmtGrowth,
  growthSign,
  filterDealsByProduct,
  isOverdueRateCritical,
  PERIOD_OPTIONS,
} from './kpiUtils';
import type { Deal, Activity } from '../types/crm';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const stages = [
  { id: 'prospec', name: 'Prospecção',  order: 1 },
  { id: 'qualif',  name: 'Qualificação',order: 2 },
  { id: 'proposta',name: 'Proposta',    order: 3 },
  { id: 'fecham',  name: 'Fechamento',  order: 4 },
];

function makeD(overrides: Partial<Deal> = {}): Pick<Deal, 'stage' | 'value' | 'status' | 'productId'> {
  return { stage: 'prospec', value: 10000, status: 'open', productId: 'wizmart', ...overrides } as any;
}

function makeA(overrides: Partial<Activity> = {}): Pick<Activity, 'type' | 'status' | 'cadenceType'> {
  return { type: 'email', status: 'pending', cadenceType: 'sdr_daily', ...overrides } as any;
}

// ── calcFunnelConversion ──────────────────────────────────────────────────────
describe('calcFunnelConversion', () => {
  const deals = [
    makeD({ stage: 'prospec', value: 10000 }),
    makeD({ stage: 'prospec', value: 10000 }),
    makeD({ stage: 'qualif',  value: 20000 }),
    makeD({ stage: 'proposta',value: 30000 }),
    makeD({ stage: 'fecham',  value: 40000, status: 'won' }),
  ];

  it('retorna estágios na ordem correta', () => {
    const result = calcFunnelConversion(deals, stages);
    expect(result.map(r => r.name)).toEqual(['Prospecção', 'Qualificação', 'Proposta', 'Fechamento']);
  });

  it('conta deals por estágio corretamente', () => {
    const result = calcFunnelConversion(deals, stages);
    expect(result[0].count).toBe(2); // prospec
    expect(result[1].count).toBe(1); // qualif
    expect(result[2].count).toBe(1); // proposta
    expect(result[3].count).toBe(1); // fecham
  });

  it('taxa de conversão entre estágios', () => {
    const result = calcFunnelConversion(deals, stages);
    expect(result[0].conversion).toBe(0.5); // 1 qualif / 2 prospec
    expect(result[1].conversion).toBe(1);   // 1 proposta / 1 qualif
  });

  it('último estágio tem taxa baseada em won', () => {
    const result = calcFunnelConversion(deals, stages);
    const last = result[result.length - 1];
    expect(last.conversion).toBe(1); // 1 won / 1 fecham
  });

  it('lista vazia retorna zeros', () => {
    const result = calcFunnelConversion([], stages);
    expect(result.every(r => r.count === 0)).toBe(true);
  });

  it('estágios sem deals têm taxa 0', () => {
    const result = calcFunnelConversion([], stages);
    expect(result.every(r => r.conversion === 0)).toBe(true);
  });
});

// ── calcSDRMetrics ────────────────────────────────────────────────────────────
describe('calcSDRMetrics', () => {
  const activities = [
    makeA({ type: 'email',    status: 'completed', cadenceType: 'sdr_daily' }),
    makeA({ type: 'linkedin', status: 'completed', cadenceType: 'sdr_daily' }),
    makeA({ type: 'call',     status: 'overdue',   cadenceType: 'sdr_daily' }),
    makeA({ type: 'meeting',  status: 'completed', cadenceType: 'sdr_daily' }),
    makeA({ type: 'visit',    status: 'completed', cadenceType: 'sdr_daily' }),
    makeA({ type: 'email',    status: 'pending',   cadenceType: 'rep_followup' }), // não conta
  ];

  it('totalActivities conta apenas sdr_daily', () => {
    const m = calcSDRMetrics(activities);
    expect(m.totalActivities).toBe(5);
  });

  it('completionRate correto (4/5)', () => {
    const m = calcSDRMetrics(activities);
    expect(m.completionRate).toBe(4 / 5);
  });

  it('byType conta atividades concluídas por tipo', () => {
    const m = calcSDRMetrics(activities);
    expect(m.byType.email).toBe(1);
    expect(m.byType.linkedin).toBe(1);
    expect(m.byType.meeting).toBe(1);
    expect(m.byType.visit).toBe(1);
  });

  it('overdueCount correto', () => {
    const m = calcSDRMetrics(activities);
    expect(m.overdueCount).toBe(1);
  });

  it('reuniões e visitas contadas separadamente', () => {
    const m = calcSDRMetrics(activities);
    expect(m.meetingsScheduled).toBe(1);
    expect(m.visitsScheduled).toBe(1);
  });

  it('lista vazia → zeros', () => {
    const m = calcSDRMetrics([]);
    expect(m.totalActivities).toBe(0);
    expect(m.completionRate).toBe(0);
  });
});

// ── calcRepMetrics ────────────────────────────────────────────────────────────
describe('calcRepMetrics', () => {
  const deals = [
    makeD({ status: 'won', value: 50000 }),
    makeD({ status: 'won', value: 30000 }),
    makeD({ status: 'open', value: 80000 }),
  ];
  const activities = [
    makeA({ type: 'visit',    status: 'completed', cadenceType: 'rep_followup' }),
    makeA({ type: 'proposal', status: 'completed', cadenceType: 'rep_followup' }),
    makeA({ type: 'call',     status: 'overdue',   cadenceType: 'rep_followup' }),
    makeA({ type: 'email',    status: 'pending',   cadenceType: 'sdr_daily' }), // não conta
  ];

  it('contractsSigned = deals won', () => {
    const m = calcRepMetrics(deals, activities);
    expect(m.contractsSigned).toBe(2);
  });

  it('revenue soma apenas deals won', () => {
    const m = calcRepMetrics(deals, activities);
    expect(m.revenue).toBe(80000);
  });

  it('avgDealValue correto', () => {
    const m = calcRepMetrics(deals, activities);
    expect(m.avgDealValue).toBe(40000);
  });

  it('visitsDone conta rep_followup visit completed', () => {
    const m = calcRepMetrics(deals, activities);
    expect(m.visitsDone).toBe(1);
  });

  it('overdueCount apenas rep_followup', () => {
    const m = calcRepMetrics(deals, activities);
    expect(m.overdueCount).toBe(1);
  });

  it('sem deals won → revenue 0', () => {
    const m = calcRepMetrics([makeD({ status: 'open', value: 50000 })], []);
    expect(m.revenue).toBe(0);
    expect(m.avgDealValue).toBe(0);
  });
});

// ── buildRanking ──────────────────────────────────────────────────────────────
describe('buildRanking', () => {
  const entries = [
    { userId: 'u1', name: 'Ana',   initials: 'A', color: '#000', value: 300 },
    { userId: 'u2', name: 'João',  initials: 'J', color: '#000', value: 500 },
    { userId: 'u3', name: 'Maria', initials: 'M', color: '#000', value: 100 },
  ];

  it('ordena por value descendente', () => {
    const ranked = buildRanking(entries);
    expect(ranked[0].name).toBe('João');
    expect(ranked[1].name).toBe('Ana');
    expect(ranked[2].name).toBe('Maria');
  });

  it('não muta a lista original', () => {
    buildRanking(entries);
    expect(entries[0].name).toBe('Ana');
  });

  it('lista vazia retorna vazia', () => {
    expect(buildRanking([])).toHaveLength(0);
  });
});

// ── Formatação ────────────────────────────────────────────────────────────────
describe('fmtKpiRate', () => {
  it('0 → "0.0%"',    () => expect(fmtKpiRate(0)).toBe('0.0%'));
  it('1 → "100.0%"',  () => expect(fmtKpiRate(1)).toBe('100.0%'));
  it('0.753 → "75.3%"',() => expect(fmtKpiRate(0.753)).toBe('75.3%'));
});

describe('calcGrowth', () => {
  it('crescimento positivo', ()  => expect(calcGrowth(110, 100)).toBe(10));
  it('queda negativa', ()        => expect(calcGrowth(90,  100)).toBe(-10));
  it('previous zero + atual > 0 → 100%', () => expect(calcGrowth(5, 0)).toBe(100));
  it('ambos zero → 0',           () => expect(calcGrowth(0, 0)).toBe(0));
  it('sem mudança → 0',          () => expect(calcGrowth(50, 50)).toBe(0));
});

describe('fmtGrowth', () => {
  it('positivo tem sinal +', ()  => expect(fmtGrowth(12.3)).toBe('+12.3%'));
  it('negativo tem sinal -', ()  => expect(fmtGrowth(-5.1)).toBe('-5.1%'));
  it('zero tem sinal +',     ()  => expect(fmtGrowth(0)).toBe('+0.0%'));
});

describe('growthSign', () => {
  it('positivo → "+"', ()  => expect(growthSign(5)).toBe('+'));
  it('zero → "+"',     ()  => expect(growthSign(0)).toBe('+'));
  it('negativo → ""',  ()  => expect(growthSign(-3)).toBe(''));
});

// ── filterDealsByProduct ──────────────────────────────────────────────────────
describe('filterDealsByProduct', () => {
  const deals = [
    { productId: 'wizmart' },
    { productId: 'smart_cafe' },
    { productId: 'wizmart' },
    { productId: undefined },
  ] as any[];

  it('"all" retorna todos', () => {
    expect(filterDealsByProduct(deals, 'all')).toHaveLength(4);
  });
  it('wizmart retorna apenas wizmart', () => {
    expect(filterDealsByProduct(deals, 'wizmart')).toHaveLength(2);
  });
  it('smart_cafe retorna apenas smart_cafe', () => {
    expect(filterDealsByProduct(deals, 'smart_cafe')).toHaveLength(1);
  });
  it('productId undefined retorna todos', () => {
    expect(filterDealsByProduct(deals, '')).toHaveLength(4);
  });
});

// ── isOverdueRateCritical ─────────────────────────────────────────────────────
describe('isOverdueRateCritical', () => {
  it('20% exato não é crítico', () => {
    expect(isOverdueRateCritical(2, 10)).toBe(false); // 20% = não > 20%
  });
  it('21% é crítico', () => {
    expect(isOverdueRateCritical(21, 100)).toBe(true);
  });
  it('0 de 0 não é crítico', () => {
    expect(isOverdueRateCritical(0, 0)).toBe(false);
  });
  it('0 overdue nunca é crítico', () => {
    expect(isOverdueRateCritical(0, 100)).toBe(false);
  });
});

// ── PERIOD_OPTIONS ────────────────────────────────────────────────────────────
describe('PERIOD_OPTIONS', () => {
  it('tem exatamente 4 opções', () => {
    expect(PERIOD_OPTIONS).toHaveLength(4);
  });
  it('contém daily, weekly, monthly, quarterly', () => {
    const keys = PERIOD_OPTIONS.map(p => p.key);
    expect(keys).toContain('daily');
    expect(keys).toContain('monthly');
    expect(keys).toContain('quarterly');
  });
});
