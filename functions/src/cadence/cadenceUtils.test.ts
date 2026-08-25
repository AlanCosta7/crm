import { describe, expect, it } from "vitest";
import {
  pickBalancedCandidates,
  periodTimeOnDay,
  stepsForDayOffset,
  normalizeCadenceConfig,
  DEFAULT_PERIOD_TIMES,
  type SequenceStep,
} from "./cadenceUtils";

interface TestCandidate {
  id: string;
  size: "P" | "M" | "G";
}

const ZERO = { P: 0, M: 0, G: 0 };

describe("pickBalancedCandidates", () => {
  it("SDR sem cards nenhum: prioriza P (empate resolvido por P > M > G)", () => {
    const candidates: TestCandidate[] = [
      { id: "g1", size: "G" },
      { id: "m1", size: "M" },
      { id: "p1", size: "P" },
    ];
    const picked = pickBalancedCandidates(candidates, 1, ZERO);
    expect(picked.map(c => c.id)).toEqual(["p1"]);
  });

  it("SDR já tem 3 G e 0 P: próxima vaga prioriza P mesmo não sendo o mais recente", () => {
    // Fila em ordem de recência: G é o mais recente, P é o mais antigo.
    const candidates: TestCandidate[] = [
      { id: "g-recent", size: "G" },
      { id: "m-mid",    size: "M" },
      { id: "p-old",    size: "P" },
    ];
    const bySize = { P: 0, M: 0, G: 3 };
    const picked = pickBalancedCandidates(candidates, 1, bySize);
    expect(picked.map(c => c.id)).toEqual(["p-old"]);
  });

  it("dentro do mesmo porte, mantém a ordem de recência recebida", () => {
    const candidates: TestCandidate[] = [
      { id: "p-recent", size: "P" },
      { id: "p-older",  size: "P" },
      { id: "p-oldest", size: "P" },
    ];
    const picked = pickBalancedCandidates(candidates, 2, ZERO);
    expect(picked.map(c => c.id)).toEqual(["p-recent", "p-older"]);
  });

  it("porte preferido sem candidato disponível: cai pro próximo mais defasado", () => {
    // SDR defasado em P, mas não há nenhum P na fila — M e G empatados em 5,
    // o desempate P > M > G decide por M antes de G.
    const candidates: TestCandidate[] = [
      { id: "g1", size: "G" },
      { id: "m1", size: "M" },
    ];
    const bySize = { P: 0, M: 5, G: 5 };
    const picked = pickBalancedCandidates(candidates, 1, bySize);
    expect(picked.map(c => c.id)).toEqual(["m1"]);
  });

  it("nenhuma preferência tem candidato disponível: cai pra recência pura", () => {
    // SDR defasado em P e M (ambos com déficit), mas só há G na fila.
    const candidates: TestCandidate[] = [
      { id: "g-recent", size: "G" },
      { id: "g-older",  size: "G" },
    ];
    const bySize = { P: 10, M: 10, G: 0 };
    const picked = pickBalancedCandidates(candidates, 2, bySize);
    expect(picked.map(c => c.id)).toEqual(["g-recent", "g-older"]);
  });

  it("preenche várias vagas alternando o porte conforme cada escolha atualiza a defasagem", () => {
    // 2 P e 2 G na fila, SDR zerado — deve alternar P, G, P, G (P sempre
    // vence o empate contra G até ficarem parelhos, daí decide por G ter
    // ficado mais defasado depois do 1º P escolhido... vamos conferir o
    // comportamento real, não adivinhar).
    const candidates: TestCandidate[] = [
      { id: "p1", size: "P" },
      { id: "g1", size: "G" },
      { id: "p2", size: "P" },
      { id: "g2", size: "G" },
    ];
    const picked = pickBalancedCandidates(candidates, 4, ZERO);
    expect(picked.map(c => c.id).sort()).toEqual(["g1", "g2", "p1", "p2"]);
    // As duas primeiras vagas não podem ser do mesmo porte (senão o SDR
    // ficaria com 2 do mesmo antes de tocar no outro, quebrando o objetivo
    // de equilibrar).
    expect(picked[0].size).not.toBe(picked[1].size);
  });

  it("count maior que candidatos disponíveis: pega todos, sem duplicar nem quebrar", () => {
    const candidates: TestCandidate[] = [{ id: "p1", size: "P" }];
    const picked = pickBalancedCandidates(candidates, 5, ZERO);
    expect(picked).toHaveLength(1);
  });

  it("count zero: não escolhe nada", () => {
    const candidates: TestCandidate[] = [{ id: "p1", size: "P" }];
    expect(pickBalancedCandidates(candidates, 0, ZERO)).toEqual([]);
  });
});

describe("periodTimeOnDay", () => {
  it("converte manhã (09:00 BRT) pro instante UTC correto (12:00 UTC, BRT = UTC-3)", () => {
    const d = periodTimeOnDay("manha", DEFAULT_PERIOD_TIMES, "2026-08-24");
    expect(d.toISOString()).toBe("2026-08-24T12:00:00.000Z");
  });

  it("converte fim do dia (18:00 BRT) pro instante UTC correto (21:00 UTC)", () => {
    const d = periodTimeOnDay("fim_dia", DEFAULT_PERIOD_TIMES, "2026-08-24");
    expect(d.toISOString()).toBe("2026-08-24T21:00:00.000Z");
  });

  it("usa o horário customizado do período quando configurado", () => {
    const custom = { manha: "08:30", tarde: "13:00", fim_dia: "18:00" };
    const d = periodTimeOnDay("manha", custom, "2026-08-24");
    expect(d.toISOString()).toBe("2026-08-24T11:30:00.000Z");
  });

  it("cai pro horário padrão se o valor configurado for inválido", () => {
    const broken = { manha: "not-a-time", tarde: "13:00", fim_dia: "18:00" } as any;
    const d = periodTimeOnDay("manha", broken, "2026-08-24");
    expect(d.toISOString()).toBe("2026-08-24T12:00:00.000Z"); // padrão 09:00 BRT
  });
});

describe("stepsForDayOffset", () => {
  const sequence: SequenceStep[] = [
    { type: "email",    dayOffset: 0, period: "manha" },
    { type: "call",     dayOffset: 0, period: "manha" },
    { type: "linkedin", dayOffset: 0, period: "tarde" },
    { type: "whatsapp", dayOffset: 1, period: "fim_dia" },
  ];

  it("filtra só os steps do dia pedido, preservando a ordem original", () => {
    expect(stepsForDayOffset(sequence, 0).map(s => s.type)).toEqual(["email", "call", "linkedin"]);
    expect(stepsForDayOffset(sequence, 1).map(s => s.type)).toEqual(["whatsapp"]);
    expect(stepsForDayOffset(sequence, 2)).toEqual([]);
  });
});

describe("normalizeCadenceConfig — sequência e horários dos períodos", () => {
  it("sequência ausente/vazia cai pro padrão legado ([])", () => {
    expect(normalizeCadenceConfig(null).sequence).toEqual([]);
    expect(normalizeCadenceConfig({ sdr: {} }).sequence).toEqual([]);
  });

  it("aceita uma sequência válida com os 4 canais, sem duplicar nem faltar nenhum", () => {
    const raw = {
      sdr: {
        sequence: [
          { type: "email",    dayOffset: 0, period: "manha" },
          { type: "linkedin", dayOffset: 0, period: "tarde" },
          { type: "whatsapp", dayOffset: 1, period: "fim_dia" },
          { type: "call",     dayOffset: 0, period: "manha" },
        ],
      },
    };
    const cfg = normalizeCadenceConfig(raw);
    expect(cfg.sequence).toHaveLength(4);
    expect(cfg.sequence[2]).toEqual({ type: "whatsapp", dayOffset: 1, period: "fim_dia" });
  });

  it("rejeita sequência com canal duplicado (cai pro padrão legado)", () => {
    const raw = {
      sdr: {
        sequence: [
          { type: "email", dayOffset: 0, period: "manha" },
          { type: "email", dayOffset: 1, period: "tarde" },
          { type: "linkedin", dayOffset: 0, period: "manha" },
          { type: "call", dayOffset: 0, period: "manha" },
        ],
      },
    };
    expect(normalizeCadenceConfig(raw).sequence).toEqual([]);
  });

  it("rejeita sequência faltando um canal (cai pro padrão legado)", () => {
    const raw = {
      sdr: {
        sequence: [
          { type: "email", dayOffset: 0, period: "manha" },
          { type: "linkedin", dayOffset: 0, period: "manha" },
          { type: "call", dayOffset: 0, period: "manha" },
        ],
      },
    };
    expect(normalizeCadenceConfig(raw).sequence).toEqual([]);
  });

  it("rejeita dayOffset fora do intervalo 0–3 ou período inválido", () => {
    const base = [
      { type: "email", dayOffset: 0, period: "manha" },
      { type: "linkedin", dayOffset: 0, period: "manha" },
      { type: "call", dayOffset: 0, period: "manha" },
    ];
    expect(normalizeCadenceConfig({ sdr: { sequence: [...base, { type: "whatsapp", dayOffset: 9, period: "manha" }] } }).sequence).toEqual([]);
    expect(normalizeCadenceConfig({ sdr: { sequence: [...base, { type: "whatsapp", dayOffset: 1, period: "noite" }] } }).sequence).toEqual([]);
  });

  it("horários dos períodos: usa configurado se for HH:mm válido, senão o padrão", () => {
    expect(normalizeCadenceConfig({ sdr: { periodTimes: { manha: "08:00", tarde: "12:30", fim_dia: "19:00" } } }).periodTimes)
      .toEqual({ manha: "08:00", tarde: "12:30", fim_dia: "19:00" });
    expect(normalizeCadenceConfig({ sdr: { periodTimes: { manha: "25:99" } } }).periodTimes.manha).toBe(DEFAULT_PERIOD_TIMES.manha);
    expect(normalizeCadenceConfig(null).periodTimes).toEqual(DEFAULT_PERIOD_TIMES);
  });
});
