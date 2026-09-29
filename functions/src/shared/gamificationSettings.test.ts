import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACTION_POINTS,
  DEFAULT_SDR_RANKING_WEIGHTS,
  effectiveActionPoints,
  effectiveSdrRankingWeights,
} from "./gamificationSettings";

describe("gamificationSettings", () => {
  it("sem documento, usa os padrões (compatibilidade com o valor fixo anterior)", () => {
    expect(effectiveActionPoints(undefined)).toEqual(DEFAULT_ACTION_POINTS);
    expect(effectiveActionPoints(null)).toEqual(DEFAULT_ACTION_POINTS);
    expect(effectiveSdrRankingWeights(undefined)).toEqual(DEFAULT_SDR_RANKING_WEIGHTS);
  });

  it("documento parcial: só sobrescreve as chaves presentes", () => {
    const pts = effectiveActionPoints({ actionPoints: { dealWon: 250 } });
    expect(pts).toEqual({ ...DEFAULT_ACTION_POINTS, dealWon: 250 });
  });

  it("pesos parciais mantêm o resto no padrão", () => {
    const w = effectiveSdrRankingWeights({ sdrRankingWeights: { actPct: 5 } });
    expect(w).toEqual({ ...DEFAULT_SDR_RANKING_WEIGHTS, actPct: 5 });
  });
});
