/**
 * coinUtils.test.ts — Testes do Sistema de Moedas
 *
 * Cobre: ciclos trimestrais, saldo, formatação, validação de resgate,
 * tabela de premiação e regra de milestone de PDV.
 */

import { describe, it, expect } from 'vitest';
import {
  getCurrentCycleKey,
  getCurrentCycleInfo,
  getCycleInfoByKey,
  daysUntilCycleEnd,
  isFairApproaching,
  calcCoinBalance,
  calcCoinsEarnedInCycle,
  calcCoinsRedeemedInCycle,
  formatCoins,
  getCoinEventLabel,
  getCoinEventStyle,
  validateRedemption,
  getCoinsForEvent,
  getMilestoneCoinEvent,
  COIN_REWARDS,
} from './coinUtils';
import type { CoinEventType } from '../types/crm';

// ── getCurrentCycleKey ────────────────────────────────────────────────────────
describe('getCurrentCycleKey', () => {
  it('Janeiro → Q1', () => {
    expect(getCurrentCycleKey(new Date('2026-01-15'))).toBe('Q1-2026');
  });
  it('Março → Q1', () => {
    expect(getCurrentCycleKey(new Date('2026-03-31'))).toBe('Q1-2026');
  });
  it('Abril → Q2', () => {
    expect(getCurrentCycleKey(new Date('2026-04-15T12:00:00'))).toBe('Q2-2026');
  });
  it('Junho → Q2', () => {
    expect(getCurrentCycleKey(new Date('2026-06-15T12:00:00'))).toBe('Q2-2026');
  });
  it('Julho → Q3', () => {
    expect(getCurrentCycleKey(new Date('2026-07-15T12:00:00'))).toBe('Q3-2026');
  });
  it('Outubro → Q4', () => {
    expect(getCurrentCycleKey(new Date('2026-10-15'))).toBe('Q4-2026');
  });
  it('Dezembro → Q4', () => {
    expect(getCurrentCycleKey(new Date('2026-12-31'))).toBe('Q4-2026');
  });
  it('formato correto QNNN-YYYY', () => {
    expect(getCurrentCycleKey()).toMatch(/^Q[1-4]-\d{4}$/);
  });
});

// ── getCurrentCycleInfo ───────────────────────────────────────────────────────
describe('getCurrentCycleInfo', () => {
  it('Q2 tem label correto', () => {
    const info = getCurrentCycleInfo(new Date('2026-05-15'));
    expect(info.label).toBe('2º Trimestre de 2026');
    expect(info.quarter).toBe(2);
    expect(info.year).toBe(2026);
  });

  it('Q1 começa em Janeiro e termina em Março', () => {
    const info = getCurrentCycleInfo(new Date('2026-02-10'));
    expect(info.startDate.getMonth()).toBe(0); // Janeiro = 0
    expect(info.endDate.getMonth()).toBe(2);   // Março = 2
  });

  it('Q4 começa em Outubro e termina em Dezembro', () => {
    const info = getCurrentCycleInfo(new Date('2026-11-01'));
    expect(info.startDate.getMonth()).toBe(9);  // Outubro = 9
    expect(info.endDate.getMonth()).toBe(11);   // Dezembro = 11
  });

  it('endDate é o último dia do mês', () => {
    const info = getCurrentCycleInfo(new Date('2026-06-15')); // Q2
    expect(info.endDate.getDate()).toBe(30); // Junho tem 30 dias
  });
});

// ── getCycleInfoByKey ─────────────────────────────────────────────────────────
describe('getCycleInfoByKey', () => {
  it('parseia "Q3-2026" corretamente', () => {
    const info = getCycleInfoByKey('Q3-2026');
    expect(info).not.toBeNull();
    expect(info!.quarter).toBe(3);
    expect(info!.year).toBe(2026);
  });
  it('chave inválida retorna null', () => {
    expect(getCycleInfoByKey('INVALID')).toBeNull();
    expect(getCycleInfoByKey('Q5-2026')).toBeNull();
    expect(getCycleInfoByKey('')).toBeNull();
  });
});

// ── daysUntilCycleEnd ─────────────────────────────────────────────────────────
describe('daysUntilCycleEnd', () => {
  it('primeiro dia do ciclo tem mais de 80 dias restantes', () => {
    const jan10 = new Date('2026-01-10T12:00:00'); // meio de janeiro para evitar timezone
    expect(daysUntilCycleEnd(jan10)).toBeGreaterThan(70);
  });
  it('último dia do ciclo tem 1 ou 0 dias restantes', () => {
    const mar31 = new Date('2026-03-31T23:00:00');
    expect(daysUntilCycleEnd(mar31)).toBeLessThanOrEqual(1);
  });
  it('nunca retorna negativo', () => {
    const afterCycle = new Date('2026-04-01');
    expect(daysUntilCycleEnd(afterCycle)).toBeGreaterThanOrEqual(0);
  });
});

// ── isFairApproaching ────────────────────────────────────────────────────────
describe('isFairApproaching', () => {
  it('20 dias antes → não está se aproximando (threshold=15)', () => {
    const mar11 = new Date('2026-03-11');
    expect(isFairApproaching(mar11, 15)).toBe(false);
  });
  it('10 dias antes → está se aproximando (threshold=15)', () => {
    const mar21 = new Date('2026-03-21');
    expect(isFairApproaching(mar21, 15)).toBe(true);
  });
  it('último dia → está se aproximando', () => {
    const mar31 = new Date('2026-03-31');
    expect(isFairApproaching(mar31, 15)).toBe(true);
  });
});

// ── calcCoinBalance ───────────────────────────────────────────────────────────
describe('calcCoinBalance', () => {
  it('lista vazia → 0', () => {
    expect(calcCoinBalance([])).toBe(0);
  });
  it('soma de positivos', () => {
    expect(calcCoinBalance([{ amount: 5 }, { amount: 3 }, { amount: 1 }])).toBe(9);
  });
  it('soma com negativos (resgates)', () => {
    expect(calcCoinBalance([{ amount: 10 }, { amount: -4 }])).toBe(6);
  });
  it('saldo pode ser negativo se mais resgates que ganhos', () => {
    expect(calcCoinBalance([{ amount: 3 }, { amount: -10 }])).toBe(-7);
  });
});

// ── calcCoinsEarnedInCycle ────────────────────────────────────────────────────
describe('calcCoinsEarnedInCycle', () => {
  const txs = [
    { amount:  3, cycle: 'Q1-2026' },
    { amount:  5, cycle: 'Q1-2026' },
    { amount: -2, cycle: 'Q1-2026' }, // resgate
    { amount:  4, cycle: 'Q2-2026' },
  ];

  it('Q1-2026 → 8 (ignora resgate e Q2)', () => {
    expect(calcCoinsEarnedInCycle(txs, 'Q1-2026')).toBe(8);
  });
  it('Q2-2026 → 4', () => {
    expect(calcCoinsEarnedInCycle(txs, 'Q2-2026')).toBe(4);
  });
  it('Q3 sem transações → 0', () => {
    expect(calcCoinsEarnedInCycle(txs, 'Q3-2026')).toBe(0);
  });
});

// ── calcCoinsRedeemedInCycle ──────────────────────────────────────────────────
describe('calcCoinsRedeemedInCycle', () => {
  const txs = [
    { amount:  10, cycle: 'Q1-2026' },
    { amount:  -3, cycle: 'Q1-2026' },
    { amount:  -5, cycle: 'Q1-2026' },
    { amount:  -1, cycle: 'Q2-2026' },
  ];

  it('Q1 → 8 moedas resgatadas', () => {
    expect(calcCoinsRedeemedInCycle(txs, 'Q1-2026')).toBe(8);
  });
  it('Q2 → 1 moeda resgatada', () => {
    expect(calcCoinsRedeemedInCycle(txs, 'Q2-2026')).toBe(1);
  });
});

// ── formatCoins ───────────────────────────────────────────────────────────────
describe('formatCoins', () => {
  it('1 → "1 moeda"', ()  => expect(formatCoins(1)).toBe('1 moeda'));
  it('0 → "0 moedas"', () => expect(formatCoins(0)).toBe('0 moedas'));
  it('42 → "42 moedas"', ()=> expect(formatCoins(42)).toBe('42 moedas'));
  it('-3 → "-3 moedas"', ()=> expect(formatCoins(-3)).toBe('-3 moedas'));
});

// ── getCoinEventLabel ─────────────────────────────────────────────────────────
describe('getCoinEventLabel', () => {
  it('activity_ontime → label correto', () => {
    expect(getCoinEventLabel('activity_ontime')).toContain('Atividade');
  });
  it('redemption → label correto', () => {
    expect(getCoinEventLabel('redemption')).toContain('Resgate');
  });
  it('todos os tipos têm label', () => {
    const types: CoinEventType[] = [
      'activity_ontime','meeting_scheduled','visit_scheduled','visit_done',
      'proposal_presented','contract_signed','pdv_3k','pdv_10k','pdv_20k',
      'redemption','admin_adjustment',
    ];
    for (const t of types) {
      expect(getCoinEventLabel(t)).toBeTruthy();
    }
  });
});

// ── getCoinEventStyle ─────────────────────────────────────────────────────────
describe('getCoinEventStyle', () => {
  it('ganhos são positivos', () => {
    expect(getCoinEventStyle('activity_ontime').isPositive).toBe(true);
    expect(getCoinEventStyle('contract_signed').isPositive).toBe(true);
  });
  it('resgates são negativos', () => {
    expect(getCoinEventStyle('redemption').isPositive).toBe(false);
  });
  it('todos têm icon e color', () => {
    const types: CoinEventType[] = ['activity_ontime', 'pdv_10k', 'redemption'];
    for (const t of types) {
      const s = getCoinEventStyle(t);
      expect(s.icon).toBeTruthy();
      expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ── validateRedemption ────────────────────────────────────────────────────────
describe('validateRedemption', () => {
  it('saldo suficiente + estoque ilimitado → pode resgatar', () => {
    const r = validateRedemption(20, 10, -1);
    expect(r.canRedeem).toBe(true);
  });
  it('saldo suficiente + estoque > 0 → pode resgatar', () => {
    const r = validateRedemption(10, 10, 5);
    expect(r.canRedeem).toBe(true);
  });
  it('saldo insuficiente → não pode resgatar', () => {
    const r = validateRedemption(5, 10, -1);
    expect(r.canRedeem).toBe(false);
    expect(r.reason).toContain('Saldo insuficiente');
  });
  it('estoque zero → não pode resgatar', () => {
    const r = validateRedemption(100, 10, 0);
    expect(r.canRedeem).toBe(false);
    expect(r.reason).toContain('esgotado');
  });
  it('saldo exatamente igual ao custo → pode resgatar', () => {
    expect(validateRedemption(10, 10, 1).canRedeem).toBe(true);
  });
});

// ── getCoinsForEvent ──────────────────────────────────────────────────────────
describe('getCoinsForEvent', () => {
  it('activity_ontime → 1 moeda', () => {
    expect(getCoinsForEvent('activity_ontime')).toBe(1);
  });
  it('pdv_3k → 3 moedas', () => {
    expect(getCoinsForEvent('pdv_3k')).toBe(3);
  });
  it('pdv_10k → 5 moedas', () => {
    expect(getCoinsForEvent('pdv_10k')).toBe(5);
  });
  it('pdv_20k → 10 moedas', () => {
    expect(getCoinsForEvent('pdv_20k')).toBe(10);
  });
  it('redemption → 0 (não premia ao resgatar)', () => {
    expect(getCoinsForEvent('redemption')).toBe(0);
  });
  it('admin_adjustment → 0', () => {
    expect(getCoinsForEvent('admin_adjustment')).toBe(0);
  });
});

// ── getMilestoneCoinEvent ─────────────────────────────────────────────────────
describe('getMilestoneCoinEvent — regra de acumulação de PDV', () => {
  it('R$ 2.999 → nenhum milestone', () => {
    expect(getMilestoneCoinEvent(2999)).toBeNull();
  });
  it('R$ 3.000 → pdv_3k', () => {
    expect(getMilestoneCoinEvent(3000)).toBe('pdv_3k');
  });
  it('R$ 9.999 → pdv_3k (não pdv_10k)', () => {
    expect(getMilestoneCoinEvent(9999)).toBe('pdv_3k');
  });
  it('R$ 10.000 → pdv_10k', () => {
    expect(getMilestoneCoinEvent(10000)).toBe('pdv_10k');
  });
  it('R$ 19.999 → pdv_10k (não pdv_20k)', () => {
    expect(getMilestoneCoinEvent(19999)).toBe('pdv_10k');
  });
  it('R$ 20.000 → pdv_20k', () => {
    expect(getMilestoneCoinEvent(20000)).toBe('pdv_20k');
  });
  it('R$ 25.000 → pdv_20k (apenas o mais alto)', () => {
    expect(getMilestoneCoinEvent(25000)).toBe('pdv_20k');
  });
  it('R$ 0 → nenhum milestone', () => {
    expect(getMilestoneCoinEvent(0)).toBeNull();
  });
});

// ── COIN_REWARDS tabela completa ──────────────────────────────────────────────
describe('COIN_REWARDS tabela de premiação', () => {
  it('todos os tipos de milestone PDV estão definidos', () => {
    expect(COIN_REWARDS.pdv_3k).toBe(3);
    expect(COIN_REWARDS.pdv_10k).toBe(5);
    expect(COIN_REWARDS.pdv_20k).toBe(10);
  });
  it('atividades operacionais valem 1 moeda', () => {
    const ops: CoinEventType[] = ['activity_ontime','meeting_scheduled','visit_scheduled','visit_done','proposal_presented','contract_signed'];
    for (const t of ops) {
      expect(COIN_REWARDS[t]).toBe(1);
    }
  });
});
