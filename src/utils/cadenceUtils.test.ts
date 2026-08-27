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
  daysBetweenBRT,
  SDR_ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG,
  DEFAULT_SDR_CADENCE_STEPS,
  findCadenceStep,
  normalizeSteps,
  missingCadenceTypesForDeal,
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

// ── daysBetweenBRT ────────────────────────────────────────────────────────────
describe('daysBetweenBRT — dias corridos entre duas datas (calendário BRT)', () => {
  it('mesma data → 0 dias', () => {
    const d = new Date('2026-08-27T14:00:00Z');
    expect(daysBetweenBRT(d, d)).toBe(0);
  });

  it('1 dia de diferença → 1', () => {
    expect(daysBetweenBRT(new Date('2026-08-27T14:00:00Z'), new Date('2026-08-28T14:00:00Z'))).toBe(1);
  });

  it('atribuído tarde da noite BRT ainda conta como o mesmo dia até virar a data', () => {
    // 2026-08-27 23:30 BRT (26:30 UTC do dia 27 = 02:30 UTC do dia 28)
    const assignedAt = new Date('2026-08-28T02:30:00Z');
    // Ainda 27/08 às 23:59 BRT
    const stillSameDay = new Date('2026-08-28T02:59:00Z');
    expect(daysBetweenBRT(assignedAt, stillSameDay)).toBe(0);
    // Virou 28/08 00:01 BRT
    const nextDay = new Date('2026-08-28T03:01:00Z');
    expect(daysBetweenBRT(assignedAt, nextDay)).toBe(1);
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

// ── Régua SDR — padrão do documento + edição pela gestão (27/08/2026) ────────
describe('DEFAULT_SDR_CADENCE_STEPS / findCadenceStep', () => {
  it('9 passos, de D0 a D+29', () => {
    expect(DEFAULT_SDR_CADENCE_STEPS).toHaveLength(9);
    expect(DEFAULT_SDR_CADENCE_STEPS.map(s => s.dayOffset)).toEqual([0, 1, 3, 5, 8, 12, 17, 23, 29]);
  });
  it('D0: contato inicial (ligação, e-mail, LinkedIn)', () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 0)?.types).toEqual(['call', 'email', 'linkedin']);
  });
  it('D+1: WhatsApp', () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 1)?.types).toEqual(['whatsapp']);
  });
  it('dia sem passo definido → undefined', () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 2)).toBeUndefined();
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 30)).toBeUndefined();
  });
});

describe('normalizeSteps — régua editável pela gestão', () => {
  it('ausente/vazia cai pro padrão do documento', () => {
    expect(normalizeSteps(undefined)).toEqual(DEFAULT_SDR_CADENCE_STEPS);
    expect(normalizeSteps([])).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });
  it('aceita uma régua customizada válida, ordenada por dia', () => {
    const raw = [
      { dayOffset: 3, types: ['email'], label: 'Depois' },
      { dayOffset: 0, types: ['call'], label: 'Início' },
    ];
    expect(normalizeSteps(raw)).toEqual([
      { dayOffset: 0, types: ['call'], label: 'Início' },
      { dayOffset: 3, types: ['email'], label: 'Depois' },
    ]);
  });
  it('sem passo no dia 0 cai pro padrão', () => {
    expect(normalizeSteps([{ dayOffset: 1, types: ['call'], label: 'A' }])).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });
  it('dois passos no mesmo dia cai pro padrão', () => {
    const raw = [
      { dayOffset: 0, types: ['call'], label: 'A' },
      { dayOffset: 0, types: ['email'], label: 'B' },
    ];
    expect(normalizeSteps(raw)).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });
  it('passo sem canal válido cai pro padrão', () => {
    expect(normalizeSteps([{ dayOffset: 0, types: [], label: 'A' }])).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });
});

// ── missingCadenceTypesForDeal — montagem da cadência sem esperar o motor ────
// (useCadencia/ensureTodaySteps, pedido do Alan 27/08/2026: deal atribuído
// manualmente ao SDR não deve esperar o cron do dia seguinte pra ganhar as
// activities do passo devido hoje).
describe('missingCadenceTypesForDeal', () => {
  const NOW = new Date('2026-08-27T12:00:00Z'); // 27/08 09:00 BRT
  const assignedToday = new Date('2026-08-27T11:00:00Z'); // mesmo dia BRT

  it('deal recém-atribuído (dia 0) sem nenhuma activity ainda → os 3 canais do D0', () => {
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedToday }, new Set(), NOW);
    expect(missing.sort()).toEqual(['call', 'email', 'linkedin'].sort());
  });

  it('já tem 2 dos 3 canais do D0 → só falta o terceiro', () => {
    const existing = new Set<'call' | 'email' | 'linkedin' | 'whatsapp'>(['call', 'email']);
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedToday }, existing as any, NOW);
    expect(missing).toEqual(['linkedin']);
  });

  it('já tem todos os canais do passo de hoje → nada faltando (idempotente)', () => {
    const existing = new Set<any>(['call', 'email', 'linkedin']);
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedToday }, existing, NOW);
    expect(missing).toEqual([]);
  });

  it('hoje não é dia de contato pra esse deal (ex.: dia 2) → nada', () => {
    const assignedTwoDaysAgo = new Date('2026-08-25T11:00:00Z');
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedTwoDaysAgo }, new Set(), NOW);
    expect(missing).toEqual([]);
  });

  it('deal em handoff (já passou o bastão) → nada, mesmo sendo dia 0', () => {
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedToday, handoffStatus: 'accepted' }, new Set(), NOW);
    expect(missing).toEqual([]);
  });

  it('deal em Standby (prospect respondeu) → nada, mesmo sendo dia 0', () => {
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedToday, standbyActive: true }, new Set(), NOW);
    expect(missing).toEqual([]);
  });

  it('sem assignedAt (legado) → nada, não inventa um dia 0', () => {
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: null }, new Set(), NOW);
    expect(missing).toEqual([]);
  });

  it('D+1 (amanhã do assignedAt) → só WhatsApp', () => {
    const assignedYesterday = new Date('2026-08-26T11:00:00Z');
    const missing = missingCadenceTypesForDeal(DEFAULT_SDR_CADENCE_STEPS, { assignedAt: assignedYesterday }, new Set(), NOW);
    expect(missing).toEqual(['whatsapp']);
  });

  it('respeita uma régua customizada, não só o padrão do documento', () => {
    const customSteps = [{ dayOffset: 0, types: ['call' as const], label: 'Só ligação' }];
    const missing = missingCadenceTypesForDeal(customSteps, { assignedAt: assignedToday }, new Set(), NOW);
    expect(missing).toEqual(['call']);
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
