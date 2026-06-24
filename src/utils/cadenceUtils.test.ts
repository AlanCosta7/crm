/**
 * cadenceUtils.test.ts — Testes do Motor de Cadência SDR
 *
 * Cobre: fórmula de distribuição de cards, taxa de conclusão,
 * cálculo de data BRT e configuração de tipos de atividade.
 */

import { describe, it, expect } from 'vitest';
import {
  calcNewCards,
  calcCompletionRate,
  getTodayBRT,
  SDR_ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG,
} from './cadenceUtils';

// ── calcNewCards ──────────────────────────────────────────────────────────────
describe('calcNewCards — fórmula de distribuição SDR', () => {
  it('1º dia (null) → 3 cards', () => {
    expect(calcNewCards(null)).toBe(3);
  });
  it('taxa 1.0 → 3 cards (máximo)', () => {
    expect(calcNewCards(1.0)).toBe(3);
  });
  it('taxa 0.75 → 2 cards', () => {
    expect(calcNewCards(0.75)).toBe(2);
  });
  it('taxa 0.67 → 2 cards (floor de 2.01)', () => {
    expect(calcNewCards(0.67)).toBe(2);
  });
  it('taxa 0.50 → 1 card', () => {
    expect(calcNewCards(0.50)).toBe(1);
  });
  it('taxa 0.33 → 0 cards (floor de 0.99)', () => {
    expect(calcNewCards(0.33)).toBe(0);
  });
  it('taxa 0.00 → 0 cards (SDR bloqueado)', () => {
    expect(calcNewCards(0.00)).toBe(0);
  });
  it('taxa > 1 não ultrapassa 3', () => {
    expect(calcNewCards(2.0)).toBe(3);
  });
  it('taxa negativa resulta em 0', () => {
    expect(calcNewCards(-0.5)).toBe(0);
  });
});

// ── calcCompletionRate ────────────────────────────────────────────────────────
describe('calcCompletionRate', () => {
  it('0 requeridas → 1.0 (sem penalidade)', () => {
    expect(calcCompletionRate(0, 0)).toBe(1);
  });
  it('0 completadas de 4 → 0.0', () => {
    expect(calcCompletionRate(0, 4)).toBe(0);
  });
  it('3 completadas de 4 → 0.75', () => {
    expect(calcCompletionRate(3, 4)).toBe(0.75);
  });
  it('4 completadas de 4 → 1.0', () => {
    expect(calcCompletionRate(4, 4)).toBe(1);
  });
  it('completadas > requeridas → 1.0 (cap)', () => {
    expect(calcCompletionRate(5, 4)).toBe(1);
  });
  it('12 completadas de 12 (3 cards × 4) → 1.0', () => {
    expect(calcCompletionRate(12, 12)).toBe(1);
  });
  it('8 completadas de 12 → 0.666...', () => {
    expect(calcCompletionRate(8, 12)).toBeCloseTo(0.667, 2);
  });
});

// ── getTodayBRT ───────────────────────────────────────────────────────────────
describe('getTodayBRT — data em fuso de Brasília', () => {
  it('retorna formato YYYY-MM-DD', () => {
    const result = getTodayBRT(new Date('2026-06-05T15:00:00Z'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converte corretamente UTC → BRT', () => {
    // 05/jun/2026 01:00 UTC = 04/jun/2026 22:00 BRT (GMT-3)
    const result = getTodayBRT(new Date('2026-06-05T01:00:00Z'));
    expect(result).toBe('2026-06-04');
  });

  it('meia-dia UTC = meia-dia BRT menos 3h ainda no mesmo dia', () => {
    // 05/jun/2026 12:00 UTC = 05/jun/2026 09:00 BRT
    const result = getTodayBRT(new Date('2026-06-05T12:00:00Z'));
    expect(result).toBe('2026-06-05');
  });

  it('usa Data.now() por padrão (sem erro)', () => {
    expect(() => getTodayBRT()).not.toThrow();
  });
});

// ── Tipos de atividade ────────────────────────────────────────────────────────
describe('SDR_ACTIVITY_TYPES', () => {
  it('contém exatamente 4 tipos', () => {
    expect(SDR_ACTIVITY_TYPES).toHaveLength(4);
  });
  it('contém email, linkedin, whatsapp e call', () => {
    expect(SDR_ACTIVITY_TYPES).toContain('email');
    expect(SDR_ACTIVITY_TYPES).toContain('linkedin');
    expect(SDR_ACTIVITY_TYPES).toContain('whatsapp');
    expect(SDR_ACTIVITY_TYPES).toContain('call');
  });
});

describe('ACTIVITY_TYPE_CONFIG', () => {
  it('todos os tipos têm icon, label, color e bg', () => {
    for (const type of SDR_ACTIVITY_TYPES) {
      const cfg = ACTIVITY_TYPE_CONFIG[type];
      expect(cfg.icon).toBeTruthy();
      expect(cfg.label).toBeTruthy();
      expect(cfg.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(cfg.bg).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
  it('WhatsApp tem cor verde (#25D366)', () => {
    expect(ACTIVITY_TYPE_CONFIG.whatsapp.color).toBe('#25D366');
  });
  it('LinkedIn tem cor azul (#0077B5)', () => {
    expect(ACTIVITY_TYPE_CONFIG.linkedin.color).toBe('#0077B5');
  });
});

// ── Cenários completos de distribuição diária ─────────────────────────────────
describe('Cenários de distribuição diária', () => {
  it('SDR completa todos os cards → recebe 3 amanhã', () => {
    const rate = calcCompletionRate(12, 12); // 3 cards × 4 atividades
    expect(calcNewCards(rate)).toBe(3);
  });

  it('SDR completa 75% → recebe 2 amanhã', () => {
    const rate = calcCompletionRate(9, 12);
    expect(calcNewCards(rate)).toBe(2);
  });

  it('SDR completa metade → recebe 1 amanhã', () => {
    const rate = calcCompletionRate(6, 12);
    expect(calcNewCards(rate)).toBe(1);
  });

  it('SDR não completa nada → bloqueado (0 cards)', () => {
    const rate = calcCompletionRate(0, 12);
    expect(calcNewCards(rate)).toBe(0);
  });
});
