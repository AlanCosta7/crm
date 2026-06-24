/**
 * Testes de crmFormat.ts
 * Cobre: formatação de moeda, lookups, datas, taxas, regras de role.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fmtCurrency,
  fmtCurrencyCompact,
  sellerById,
  stageById,
  currentPeriodKey,
  currentCycleKey,
  businessDaysUntil,
  completionRate,
  fmtRate,
  calcCadenceCards,
  initialsFromName,
  canCreateDeal,
  canViewTeamKPIs,
  canConfigureFunnels,
} from './crmFormat';
import type { Seller, Stage, UserRole } from '../types/crm';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sellers: Seller[] = [
  { id: 'u1', name: 'João Victor',  initials: 'JV', color: '#1A6B1A' },
  { id: 'u2', name: 'Ana Lima',     initials: 'AL', color: '#0E7490' },
];
const stages: Stage[] = [
  { id: 'prospec', name: 'Prospecção' },
  { id: 'negoc',   name: 'Negociação' },
];

// ── fmtCurrency ───────────────────────────────────────────────────────────────
describe('fmtCurrency', () => {
  it('formata zero', () => expect(fmtCurrency(0)).toBe('R$ 0'));
  it('formata mil', () => expect(fmtCurrency(1000)).toMatch(/R\$ 1[\.,]000/));
  it('formata valor grande', () => expect(fmtCurrency(203000)).toContain('203'));
  it('formata valor negativo sem crash', () => expect(() => fmtCurrency(-500)).not.toThrow());
});

// ── fmtCurrencyCompact ────────────────────────────────────────────────────────
describe('fmtCurrencyCompact', () => {
  it('retorna K para milhares',  () => expect(fmtCurrencyCompact(32_000)).toBe('R$ 32K'));
  it('retorna M para milhões',   () => expect(fmtCurrencyCompact(1_500_000)).toBe('R$ 1,5M'));
  it('sem sufixo abaixo de 1K', () => expect(fmtCurrencyCompact(500)).toContain('500'));
});

// ── sellerById ────────────────────────────────────────────────────────────────
describe('sellerById', () => {
  it('encontra seller existente', () => {
    expect(sellerById(sellers, 'u1').name).toBe('João Victor');
  });
  it('retorna placeholder para id inexistente', () => {
    const result = sellerById(sellers, 'x99');
    expect(result.name).toBe('Desconhecido');
    expect(result.id).toBe('unknown');
  });
  it('retorna placeholder para id vazio', () => {
    expect(sellerById(sellers, '').name).toBe('Desconhecido');
  });
  it('não muta a lista original', () => {
    const copy = [...sellers];
    sellerById(sellers, 'x99');
    expect(sellers).toEqual(copy);
  });
});

// ── stageById ─────────────────────────────────────────────────────────────────
describe('stageById', () => {
  it('encontra estágio existente', () => {
    expect(stageById(stages, 'negoc').name).toBe('Negociação');
  });
  it('retorna placeholder para id inexistente', () => {
    expect(stageById(stages, 'xyz').name).toBe('Desconhecido');
  });
  it('retorna placeholder para id vazio', () => {
    expect(stageById(stages, '').name).toBe('Desconhecido');
  });
});

// ── Períodos ──────────────────────────────────────────────────────────────────
describe('currentPeriodKey', () => {
  it('retorna formato YYYY-MM', () => {
    expect(currentPeriodKey()).toMatch(/^\d{4}-\d{2}$/);
  });
  it('o mês tem 2 dígitos (zero-padded)', () => {
    const [, month] = currentPeriodKey().split('-');
    expect(month.length).toBe(2);
  });
});

describe('currentCycleKey', () => {
  it('retorna formato Q[1-4]-YYYY', () => {
    expect(currentCycleKey()).toMatch(/^Q[1-4]-\d{4}$/);
  });
  it('usa data simulada — Q1 em Janeiro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15'));
    expect(currentCycleKey()).toBe('Q1-2026');
    vi.useRealTimers();
  });
  it('usa data simulada — Q2 em Abril', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00')); // meio do mês evita timezone issues
    expect(currentCycleKey()).toBe('Q2-2026');
    vi.useRealTimers();
  });
  it('usa data simulada — Q4 em Dezembro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31'));
    expect(currentCycleKey()).toBe('Q4-2026');
    vi.useRealTimers();
  });
});

// ── businessDaysUntil ─────────────────────────────────────────────────────────
describe('businessDaysUntil', () => {
  it('retorna 0 para o mesmo dia', () => {
    const today = new Date('2026-06-05'); // sexta-feira
    expect(businessDaysUntil(today, today)).toBe(0);
  });
  it('conta 1 dia útil (sexta → segunda)', () => {
    const from   = new Date('2026-06-05'); // sexta
    const target = new Date('2026-06-08'); // segunda
    expect(businessDaysUntil(target, from)).toBe(1);
  });
  it('pula final de semana (segunda → segunda seguinte = 5 dias úteis)', () => {
    const from   = new Date('2026-06-01'); // segunda
    const target = new Date('2026-06-08'); // segunda seguinte
    expect(businessDaysUntil(target, from)).toBe(5);
  });
  it('retorna negativo para datas passadas', () => {
    const from   = new Date('2026-06-10');
    const target = new Date('2026-06-08');
    expect(businessDaysUntil(target, from)).toBeLessThan(0);
  });
});

// ── completionRate ─────────────────────────────────────────────────────────────
describe('completionRate', () => {
  it('retorna 0 quando total é 0', () => expect(completionRate(0, 0)).toBe(0));
  it('retorna 0 quando completed é 0', () => expect(completionRate(0, 4)).toBe(0));
  it('retorna 0.75 para 3/4', () => expect(completionRate(3, 4)).toBe(0.75));
  it('retorna 1 para completed >= total', () => expect(completionRate(5, 4)).toBe(1));
  it('retorna 1 exato para 4/4', () => expect(completionRate(4, 4)).toBe(1));
});

// ── fmtRate ───────────────────────────────────────────────────────────────────
describe('fmtRate', () => {
  it('formata 0', () => expect(fmtRate(0)).toBe('0.0%'));
  it('formata 1', () => expect(fmtRate(1)).toBe('100.0%'));
  it('formata 0.753', () => expect(fmtRate(0.753)).toBe('75.3%'));
  it('formata 0.5', () => expect(fmtRate(0.5)).toBe('50.0%'));
});

// ── calcCadenceCards ──────────────────────────────────────────────────────────
describe('calcCadenceCards — fórmula SDR', () => {
  it('taxa 1.00 → 3 cards', () => expect(calcCadenceCards(1.00)).toBe(3));
  it('taxa 0.75 → 2 cards', () => expect(calcCadenceCards(0.75)).toBe(2));
  it('taxa 0.50 → 1 card',  () => expect(calcCadenceCards(0.50)).toBe(1));
  it('taxa 0.00 → 0 cards', () => expect(calcCadenceCards(0.00)).toBe(0));
  it('taxa 0.33 → 0 cards (floor de 0.99)', () => expect(calcCadenceCards(0.33)).toBe(0));
  it('não ultrapassa 3 mesmo com taxa > 1', () => expect(calcCadenceCards(2.00)).toBe(3));
});

// ── initialsFromName ──────────────────────────────────────────────────────────
describe('initialsFromName', () => {
  it('nome simples → 2 letras', () => expect(initialsFromName('João Victor')).toBe('JV'));
  it('nome único → 1 letra',    () => expect(initialsFromName('Ricardo')).toBe('R'));
  it('3 palavras → 2 letras',   () => expect(initialsFromName('Ana Beatriz Lima')).toBe('AB'));
  it('string vazia → ??',       () => expect(initialsFromName('')).toBe('??'));
  it('null/undefined → ??',     () => expect(initialsFromName(undefined as any)).toBe('??'));
  it('caixa alta preservada',   () => expect(initialsFromName('joao victor')).toBe('JV'));
});

// ── Permissões por role ───────────────────────────────────────────────────────
describe('canCreateDeal', () => {
  const can: UserRole[]    = ['master', 'manager', 'bdr'];
  const cannot: UserRole[] = ['sdr', 'rep', 'viewer'];
  can.forEach(r    => it(`${r} pode criar deal`,    () => expect(canCreateDeal(r)).toBe(true)));
  cannot.forEach(r => it(`${r} não pode criar deal`,() => expect(canCreateDeal(r)).toBe(false)));
});

describe('canViewTeamKPIs', () => {
  const can:    UserRole[] = ['master', 'manager', 'viewer'];
  const cannot: UserRole[] = ['bdr', 'sdr', 'rep'];
  can.forEach(r    => it(`${r} pode ver KPIs do time`,    () => expect(canViewTeamKPIs(r)).toBe(true)));
  cannot.forEach(r => it(`${r} não pode ver KPIs do time`,() => expect(canViewTeamKPIs(r)).toBe(false)));
});

describe('canConfigureFunnels', () => {
  const can:    UserRole[] = ['master', 'manager'];
  const cannot: UserRole[] = ['bdr', 'sdr', 'rep', 'viewer'];
  can.forEach(r    => it(`${r} pode configurar funis`,    () => expect(canConfigureFunnels(r)).toBe(true)));
  cannot.forEach(r => it(`${r} não pode configurar funis`,() => expect(canConfigureFunnels(r)).toBe(false)));
});
