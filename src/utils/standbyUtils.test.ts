import { describe, it, expect } from 'vitest';
import {
  buildStandbySchedule,
  validateStandbySchedule,
  STANDBY_MIN_FOLLOWUPS,
  STANDBY_MAX_GAP_DAYS,
} from './standbyUtils';

const START = new Date('2026-07-15T10:00:00');

describe('buildStandbySchedule', () => {
  it('gera 5 follow-ups semanais por padrão', () => {
    const dates = buildStandbySchedule(START);
    expect(dates).toHaveLength(5);
    expect(dates[0].getDate()).toBe(22); // +7 dias
    expect(dates[4].getDate()).toBe(19); // +35 dias → 19/08
    expect(dates[4].getMonth()).toBe(7); // agosto
  });

  it('respeita o intervalo customizado menor que 7 dias', () => {
    const dates = buildStandbySchedule(START, 5, 3);
    const diffDays = (dates[1].getTime() - dates[0].getTime()) / 86400000;
    expect(Math.round(diffDays)).toBe(3);
  });

  it('nunca gera menos que o mínimo de follow-ups', () => {
    expect(buildStandbySchedule(START, 2)).toHaveLength(STANDBY_MIN_FOLLOWUPS);
  });

  it('trava o intervalo no máximo de 7 dias', () => {
    const dates = buildStandbySchedule(START, 5, 30);
    const diffDays = (dates[1].getTime() - dates[0].getTime()) / 86400000;
    expect(diffDays).toBeLessThanOrEqual(STANDBY_MAX_GAP_DAYS);
  });

  it('vencimentos são sempre crescentes', () => {
    const dates = buildStandbySchedule(START);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
  });
});

describe('validateStandbySchedule', () => {
  it('aceita o cronograma gerado pelo builder', () => {
    const dates = buildStandbySchedule(START);
    expect(validateStandbySchedule(START, dates).valid).toBe(true);
  });

  it('rejeita menos de 5 follow-ups', () => {
    const dates = buildStandbySchedule(START).slice(0, 4);
    const res = validateStandbySchedule(START, dates);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('mínimo');
  });

  it('rejeita intervalo maior que 7 dias', () => {
    const dates = buildStandbySchedule(START);
    dates[2] = new Date(dates[1].getTime() + 9 * 86400000);
    const res = validateStandbySchedule(START, dates);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('7 dias');
  });

  it('rejeita datas fora de ordem', () => {
    const dates = buildStandbySchedule(START);
    [dates[1], dates[2]] = [dates[2], dates[1]];
    expect(validateStandbySchedule(START, dates).valid).toBe(false);
  });
});
