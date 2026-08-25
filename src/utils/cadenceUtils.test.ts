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
  contactDayOffsets,
  followUpForDay,
  groupActivitiesByType,
  dayOffsetLabel,
  type CadenceCard,
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

// ── Cadência semanal decrescente (Observações do cliente, jul/2026) ──────────
describe('contactDayOffsets', () => {
  it('3 contatos → dias 2, 4 e 6 da semana', () => {
    expect(contactDayOffsets(3)).toEqual([2, 4, 6]);
  });
  it('2 contatos → dias 3 e 6', () => {
    expect(contactDayOffsets(2)).toEqual([3, 6]);
  });
  it('1 contato → dia 4 (meio da semana)', () => {
    expect(contactDayOffsets(1)).toEqual([4]);
  });
  it('0 contatos → nenhum dia', () => {
    expect(contactDayOffsets(0)).toEqual([]);
  });
});

describe('followUpForDay — régua 3/2/1 por semana', () => {
  it('dia 0 (distribuição) não gera follow-up', () => {
    expect(followUpForDay(0)).toBeNull();
  });
  it('dia 2 → semana 1, contato 1', () => {
    expect(followUpForDay(2)).toEqual({ week: 1, contactIndex: 1 });
  });
  it('dia 4 → semana 1, contato 2', () => {
    expect(followUpForDay(4)).toEqual({ week: 1, contactIndex: 2 });
  });
  it('dia 6 → semana 1, contato 3', () => {
    expect(followUpForDay(6)).toEqual({ week: 1, contactIndex: 3 });
  });
  it('dia 3 → não é dia de contato na semana 1', () => {
    expect(followUpForDay(3)).toBeNull();
  });
  it('dia 10 → semana 2, contato 1 (offset 3 da semana)', () => {
    expect(followUpForDay(10)).toEqual({ week: 2, contactIndex: 1 });
  });
  it('dia 13 → semana 2, contato 2 (offset 6 da semana)', () => {
    expect(followUpForDay(13)).toEqual({ week: 2, contactIndex: 2 });
  });
  it('dia 18 → semana 3, contato único (offset 4 da semana)', () => {
    expect(followUpForDay(18)).toEqual({ week: 3, contactIndex: 1 });
  });
  it('dia 22+ → régua encerrada, sem follow-up', () => {
    expect(followUpForDay(22)).toBeNull();
    expect(followUpForDay(30)).toBeNull();
  });
  it('respeita régua customizada da gestão ([1, 1])', () => {
    expect(followUpForDay(4, [1, 1])).toEqual({ week: 1, contactIndex: 1 });
    expect(followUpForDay(11, [1, 1])).toEqual({ week: 2, contactIndex: 1 });
    expect(followUpForDay(18, [1, 1])).toBeNull();
  });
});

// ── Agrupamento por bloco de canal ────────────────────────────────────────────
describe('groupActivitiesByType', () => {
  const card = (dealId: string, acts: Partial<CadenceCard['activities']>): CadenceCard => ({
    dealId, contactName: dealId, companyName: 'Cia', isNew: true, activities: acts as any,
  });

  it('agrupa na ordem de prioridade dos canais', () => {
    const cards = [
      card('d1', {
        call:  { type: 'call',  status: 'pending',   activityId: 'a1' },
        email: { type: 'email', status: 'pending',   activityId: 'a2' },
      }),
      card('d2', {
        call:  { type: 'call',  status: 'completed', activityId: 'a3' },
      }),
    ];
    const groups = groupActivitiesByType(cards);
    expect(groups.map(g => g.type)).toEqual(['call', 'email']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('pendentes vêm antes das concluídas dentro do bloco', () => {
    const cards = [
      card('d1', { call: { type: 'call', status: 'completed', activityId: 'a1' } }),
      card('d2', { call: { type: 'call', status: 'pending',   activityId: 'a2' } }),
    ];
    const [callGroup] = groupActivitiesByType(cards);
    expect(callGroup.items[0].status).toBe('pending');
    expect(callGroup.items[1].status).toBe('completed');
  });

  it('canais sem atividade não geram bloco', () => {
    const cards = [card('d1', { linkedin: { type: 'linkedin', status: 'pending', activityId: 'a1' } })];
    const groups = groupActivitiesByType(cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('linkedin');
  });
});

describe('dayOffsetLabel', () => {
  it('rotula os dias conhecidos', () => {
    expect(dayOffsetLabel(0)).toBe('Hoje');
    expect(dayOffsetLabel(1)).toBe('Amanhã');
    expect(dayOffsetLabel(2)).toBe('Em 2 dias');
    expect(dayOffsetLabel(3)).toBe('Em 3 dias');
  });

  it('cai num rótulo genérico pra valores fora da lista', () => {
    expect(dayOffsetLabel(5)).toBe('Em 5 dias');
  });
});
