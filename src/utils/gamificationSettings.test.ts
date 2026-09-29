import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACTION_POINTS,
  DEFAULT_SDR_RANKING_WEIGHTS,
  effectiveActionPoints,
  effectiveSdrRankingWeights,
} from './gamificationSettings';

describe('gamificationSettings', () => {
  it('sem documento, usa os padrões (compatibilidade com o valor fixo anterior)', () => {
    expect(effectiveActionPoints(undefined)).toEqual(DEFAULT_ACTION_POINTS);
    expect(effectiveActionPoints(null)).toEqual(DEFAULT_ACTION_POINTS);
    expect(effectiveSdrRankingWeights(undefined)).toEqual(DEFAULT_SDR_RANKING_WEIGHTS);
  });

  it('documento parcial: só sobrescreve as chaves presentes', () => {
    const pts = effectiveActionPoints({ actionPoints: { emailSent: 5 } });
    expect(pts).toEqual({ ...DEFAULT_ACTION_POINTS, emailSent: 5 });
  });

  it('documento completo substitui todos os padrões', () => {
    const pts = effectiveActionPoints({
      actionPoints: { dealCreated: 0, emailSent: 1, whatsappSent: 2, meetingTaskDone: 3, dealWon: 4 },
    });
    expect(pts).toEqual({ dealCreated: 0, emailSent: 1, whatsappSent: 2, meetingTaskDone: 3, dealWon: 4 });
  });

  it('pesos do ranking de SDRs: parcial mantém o resto no padrão', () => {
    const w = effectiveSdrRankingWeights({ sdrRankingWeights: { visits: 500 } });
    expect(w).toEqual({ ...DEFAULT_SDR_RANKING_WEIGHTS, visits: 500 });
  });

  it('o padrão de pesos reproduz a ordem visitas > reuniões realizadas > % atividades', () => {
    // visits domina até 99 reuniões no período; meetingsDone domina até 100% de atividades.
    const score = (visits: number, meetingsDone: number, actPct: number) =>
      visits * DEFAULT_SDR_RANKING_WEIGHTS.visits +
      meetingsDone * DEFAULT_SDR_RANKING_WEIGHTS.meetingsDone +
      actPct * DEFAULT_SDR_RANKING_WEIGHTS.actPct;

    expect(score(2, 0, 0)).toBeGreaterThan(score(1, 98, 100));
    expect(score(1, 2, 0)).toBeGreaterThan(score(1, 1, 99));
  });
});
