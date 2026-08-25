/**
 * qa-coverage-gaps.test.ts — Testes de QA para fechar lacunas de cobertura
 * dos utilitários de negócio (auditoria de qualidade, jul/2026).
 *
 * Cada bloco cobre ramos que a suíte original não exercitava.
 */
import { describe, it, expect } from 'vitest';
import { contactDayOffsets, classifyDueActivities } from './cadenceUtils';
import { validateHandoffForm } from './funnelUtils';
import { validateStandbySchedule, buildStandbySchedule } from './standbyUtils';
import { fmtTimestamp } from './crmFormat';
import { validateNextActionForm, getSuggestedNextActionDate } from './handoffUtils';

// ── cadenceUtils: réguas customizadas acima de 3 contatos ─────────────────────
describe('contactDayOffsets — réguas fora do padrão', () => {
  it('4+ contatos distribui uniformemente nos dias 1–7', () => {
    const offsets = contactDayOffsets(4);
    expect(offsets).toHaveLength(4);
    expect(offsets[0]).toBe(1);
    expect(offsets[offsets.length - 1]).toBe(7);
    // estritamente crescente
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
  });
  it('mais de 7 contatos trava em 7 dias', () => {
    expect(contactDayOffsets(10)).toHaveLength(7);
  });
});

// ── cadenceUtils: alertas de agenda ───────────────────────────────────────────
describe('classifyDueActivities — alertas de agenda', () => {
  const NOW = new Date('2026-07-15T12:00:00-03:00');

  it('conta status overdue direto', () => {
    const r = classifyDueActivities([{ userId: 'u1', status: 'overdue' }], 'u1', NOW);
    expect(r).toEqual({ overdue: 1, dueToday: 0 });
  });
  it('pendente vencida no passado conta como overdue', () => {
    const r = classifyDueActivities(
      [{ userId: 'u1', status: 'pending', dueAt: new Date('2026-07-14T18:00:00-03:00') }], 'u1', NOW);
    expect(r.overdue).toBe(1);
  });
  it('pendente que vence hoje (futuro) conta como dueToday', () => {
    const r = classifyDueActivities(
      [{ userId: 'u1', status: 'pending', dueAt: new Date('2026-07-15T23:59:00-03:00') }], 'u1', NOW);
    expect(r.dueToday).toBe(1);
    expect(r.overdue).toBe(0);
  });
  it('ignora atividades de outros usuários e concluídas', () => {
    const r = classifyDueActivities([
      { userId: 'u2', status: 'overdue' },
      { userId: 'u1', status: 'completed', dueAt: NOW },
    ], 'u1', NOW);
    expect(r).toEqual({ overdue: 0, dueToday: 0 });
  });
  it('aceita Timestamp do Firestore (toDate) e ignora data inválida', () => {
    const ts = { toDate: () => new Date('2026-07-15T20:00:00-03:00') };
    const r = classifyDueActivities([
      { userId: 'u1', status: 'pending', dueAt: ts },
      { userId: 'u1', status: 'pending', dueAt: 'data-invalida' },
      { userId: 'u1', status: 'pending' }, // sem data
    ], 'u1', NOW);
    expect(r.dueToday).toBe(1);
  });
});

// ── funnelUtils: validação do handoff ─────────────────────────────────────────
describe('validateHandoffForm — ramos de data', () => {
  const base = { priorityChannel: 'call' as const, visitType: 'presential' as const, toRepId: 'r1', notes: '' };
  it('rejeita data inválida', () => {
    const r = validateHandoffForm({ ...base, visitScheduledAt: 'não-é-data' });
    expect(r.valid).toBe(false);
    expect(r.errors.visitScheduledAt).toContain('inválida');
  });
  it('rejeita data no passado', () => {
    const r = validateHandoffForm({ ...base, visitScheduledAt: '2020-01-01T10:00' });
    expect(r.valid).toBe(false);
    expect(r.errors.visitScheduledAt).toContain('futuro');
  });
});

// ── standbyUtils: follow-up fora de ordem ─────────────────────────────────────
describe('validateStandbySchedule — data repetida', () => {
  it('rejeita dois follow-ups no mesmo dia', () => {
    const dates = buildStandbySchedule(new Date('2026-07-15T10:00:00'));
    dates[1] = new Date(dates[0]); // mesmo dia do anterior
    const r = validateStandbySchedule(new Date('2026-07-15T10:00:00'), dates);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('depois do anterior');
  });
});

// ── crmFormat: timestamps ─────────────────────────────────────────────────────
describe('fmtTimestamp — formatos de entrada', () => {
  it('vazio → travessão', () => {
    expect(fmtTimestamp(null)).toBe('—');
    expect(fmtTimestamp(undefined)).toBe('—');
  });
  it('aceita Timestamp do Firestore', () => {
    const out = fmtTimestamp({ toDate: () => new Date('2026-07-15T14:30:00') });
    expect(out).toContain('15');
  });
  it('aceita Date nativa', () => {
    expect(fmtTimestamp(new Date('2026-07-15T14:30:00'))).toContain('15');
  });
});

// ── handoffUtils: próxima ação ────────────────────────────────────────────────
describe('handoffUtils — ramos restantes', () => {
  it('validateNextActionForm rejeita data inválida', () => {
    const r = validateNextActionForm({ type: 'call', scheduledAt: 'xx', notes: '' } as any);
    expect(r.valid).toBe(false);
  });
  it('getSuggestedNextActionDate retorna ISO datetime-local no futuro', () => {
    const s = getSuggestedNextActionDate();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(s).getTime()).toBeGreaterThan(Date.now());
  });
});
