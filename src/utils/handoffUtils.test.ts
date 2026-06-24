/**
 * handoffUtils.test.ts — Testes dos utilitários de handoff e SLA do Rep
 *
 * Cobre: validação da próxima ação, cálculo de dias úteis, SLA, permissões.
 */

import { describe, it, expect } from 'vitest';
import {
  validateNextActionForm,
  addBusinessDays,
  isRepOverSla,
  businessDaysSinceLastActivity,
  handoffStatusLabel,
  handoffStatusColor,
  canAcceptHandoff,
  canCreateHandoff,
  canViewAllHandoffs,
  getMaxNextActionDate,
} from './handoffUtils';
import type { UserRole } from '../types/crm';

// ── addBusinessDays ───────────────────────────────────────────────────────────
describe('addBusinessDays', () => {
  it('adiciona 1 dia útil a uma segunda → terça', () => {
    const from = new Date('2026-06-01T10:00:00'); // segunda
    const res  = addBusinessDays(from, 1);
    expect(res.getDay()).toBe(2); // terça = 2
  });

  it('pula fim de semana: sexta + 1 dia útil = segunda', () => {
    const from = new Date('2026-06-05T10:00:00'); // sexta
    const res  = addBusinessDays(from, 1);
    expect(res.getDay()).toBe(1); // segunda = 1
  });

  it('adiciona 3 dias úteis a uma quarta → segunda', () => {
    const from = new Date('2026-06-03T10:00:00'); // quarta
    const res  = addBusinessDays(from, 3);
    expect(res.getDay()).toBe(1); // segunda = 1
  });

  it('adiciona 5 dias úteis (semana cheia)', () => {
    const from = new Date('2026-06-01T10:00:00'); // segunda
    const res  = addBusinessDays(from, 5);
    expect(res.getDay()).toBe(1); // segunda seguinte = 1
  });

  it('0 dias úteis retorna mesmo dia (horário 23:59)', () => {
    const from = new Date('2026-06-03T10:00:00');
    const res  = addBusinessDays(from, 0);
    expect(res.getDate()).toBe(from.getDate());
  });
});

// ── validateNextActionForm ────────────────────────────────────────────────────
describe('validateNextActionForm', () => {
  const future1 = addBusinessDays(new Date(), 1).toISOString();
  const future2 = addBusinessDays(new Date(), 2).toISOString();

  it('formulário válido passa', () => {
    const r = validateNextActionForm({ type: 'email', scheduledAt: future1 }, 3);
    expect(r.valid).toBe(true);
    expect(Object.keys(r.errors)).toHaveLength(0);
  });

  it('tipo obrigatório', () => {
    const r = validateNextActionForm({ scheduledAt: future1 }, 3);
    expect(r.valid).toBe(false);
    expect(r.errors.type).toBeDefined();
  });

  it('data obrigatória', () => {
    const r = validateNextActionForm({ type: 'call' }, 3);
    expect(r.valid).toBe(false);
    expect(r.errors.scheduledAt).toBeDefined();
  });

  it('data no passado é inválida', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = validateNextActionForm({ type: 'call', scheduledAt: past }, 3);
    expect(r.valid).toBe(false);
    expect(r.errors.scheduledAt).toMatch(/futuro/i);
  });

  it('data além do limite de 3 dias úteis é inválida', () => {
    const beyondMax = addBusinessDays(new Date(), 10).toISOString();
    const r = validateNextActionForm({ type: 'call', scheduledAt: beyondMax }, 3);
    expect(r.valid).toBe(false);
    expect(r.errors.scheduledAt).toMatch(/dias úteis/i);
  });

  it('data dentro do limite de 3 dias úteis é válida', () => {
    const r = validateNextActionForm({ type: 'whatsapp', scheduledAt: future2 }, 3);
    expect(r.valid).toBe(true);
  });

  it('relata múltiplos erros ao mesmo tempo', () => {
    const r = validateNextActionForm({}, 3);
    expect(Object.keys(r.errors).length).toBeGreaterThanOrEqual(2);
  });
});

// ── isRepOverSla ──────────────────────────────────────────────────────────────
describe('isRepOverSla', () => {
  it('null → não está em violação', () => {
    expect(isRepOverSla(null, 3)).toBe(false);
  });

  it('atividade de hoje → dentro do SLA', () => {
    const today = new Date();
    expect(isRepOverSla(today, 3, new Date())).toBe(false);
  });

  it('atividade há 2 dias úteis → dentro do SLA de 3', () => {
    const twoDaysAgo = addBusinessDays(new Date(), -2);
    // "now" é hoje
    expect(isRepOverSla(twoDaysAgo, 3, new Date())).toBe(false);
  });

  it('atividade há 10 dias → fora do SLA de 3 dias úteis', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    expect(isRepOverSla(tenDaysAgo, 3, new Date())).toBe(true);
  });
});

// ── businessDaysSinceLastActivity ─────────────────────────────────────────────
describe('businessDaysSinceLastActivity', () => {
  it('null → 0 dias', () => {
    expect(businessDaysSinceLastActivity(null)).toBe(0);
  });

  it('hoje → 0 dias úteis desde hoje', () => {
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    const now   = new Date();
    now.setHours(18, 0, 0, 0);
    expect(businessDaysSinceLastActivity(today, now)).toBe(0);
  });

  it('segunda → quarta = 2 dias úteis', () => {
    const monday    = new Date('2026-06-01T08:00:00');
    const wednesday = new Date('2026-06-03T18:00:00');
    expect(businessDaysSinceLastActivity(monday, wednesday)).toBe(2);
  });

  it('sexta → segunda = 1 dia útil (pula fim de semana)', () => {
    const friday = new Date('2026-06-05T10:00:00');
    const monday = new Date('2026-06-08T10:00:00');
    expect(businessDaysSinceLastActivity(friday, monday)).toBe(1);
  });
});

// ── handoffStatusLabel / handoffStatusColor ───────────────────────────────────
describe('handoffStatusLabel', () => {
  it('pending_rep_acceptance → "Aguardando aceite"', () => {
    expect(handoffStatusLabel('pending_rep_acceptance')).toBe('Aguardando aceite');
  });
  it('accepted → "Aceito"', () => {
    expect(handoffStatusLabel('accepted')).toBe('Aceito');
  });
  it('declined → "Recusado"', () => {
    expect(handoffStatusLabel('declined')).toBe('Recusado');
  });
});

describe('handoffStatusColor', () => {
  it('pending = âmbar', () => {
    expect(handoffStatusColor('pending_rep_acceptance')).toBe('#F59E0B');
  });
  it('accepted = verde', () => {
    expect(handoffStatusColor('accepted')).toBe('#22C55E');
  });
  it('declined = vermelho', () => {
    expect(handoffStatusColor('declined')).toBe('#EF4444');
  });
});

// ── Permissões ────────────────────────────────────────────────────────────────
describe('canAcceptHandoff', () => {
  const can:    UserRole[] = ['rep', 'master', 'manager'];
  const cannot: UserRole[] = ['bdr', 'sdr', 'viewer'];
  can.forEach(r    => it(`${r} pode aceitar`,    () => expect(canAcceptHandoff(r)).toBe(true)));
  cannot.forEach(r => it(`${r} não pode aceitar`,() => expect(canAcceptHandoff(r)).toBe(false)));
});

describe('canCreateHandoff', () => {
  const can:    UserRole[] = ['sdr', 'master', 'manager'];
  const cannot: UserRole[] = ['bdr', 'rep', 'viewer'];
  can.forEach(r    => it(`${r} pode criar handoff`,    () => expect(canCreateHandoff(r)).toBe(true)));
  cannot.forEach(r => it(`${r} não pode criar handoff`,() => expect(canCreateHandoff(r)).toBe(false)));
});

describe('canViewAllHandoffs', () => {
  const can:    UserRole[] = ['master', 'manager'];
  const cannot: UserRole[] = ['bdr', 'sdr', 'rep', 'viewer'];
  can.forEach(r    => it(`${r} pode ver todos`,   () => expect(canViewAllHandoffs(r)).toBe(true)));
  cannot.forEach(r => it(`${r} vê apenas os seus`,() => expect(canViewAllHandoffs(r)).toBe(false)));
});

// ── getMaxNextActionDate ──────────────────────────────────────────────────────
describe('getMaxNextActionDate', () => {
  it('retorna formato datetime-local válido', () => {
    expect(getMaxNextActionDate(3)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it('data máxima é posterior a hoje', () => {
    const max  = new Date(getMaxNextActionDate(3));
    const now  = new Date();
    expect(max.getTime()).toBeGreaterThan(now.getTime());
  });
});
