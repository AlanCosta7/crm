import { describe, expect, it } from "vitest";
import {
  pickBalancedCandidates,
  normalizeCadenceConfig,
  findCadenceStep,
  DEFAULT_SDR_CADENCE_STEPS,
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

describe("DEFAULT_SDR_CADENCE_STEPS / findCadenceStep — régua padrão do documento", () => {
  it("tem 9 passos, começando em D0 e terminando em D+29", () => {
    expect(DEFAULT_SDR_CADENCE_STEPS).toHaveLength(9);
    expect(DEFAULT_SDR_CADENCE_STEPS[0].dayOffset).toBe(0);
    expect(DEFAULT_SDR_CADENCE_STEPS[DEFAULT_SDR_CADENCE_STEPS.length - 1].dayOffset).toBe(29);
  });

  it("D0 é o contato inicial: ligação, e-mail e LinkedIn (sem WhatsApp)", () => {
    const step = findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 0);
    expect(step?.types).toEqual(["call", "email", "linkedin"]);
  });

  it("D+1 é só WhatsApp", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 1)?.types).toEqual(["whatsapp"]);
  });

  it("D+3 e D+17 combinam ligação e LinkedIn", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 3)?.types).toEqual(["call", "linkedin"]);
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 17)?.types).toEqual(["call", "linkedin"]);
  });

  it("D+8 combina ligação e WhatsApp", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 8)?.types).toEqual(["call", "whatsapp"]);
  });

  it("D+5 e D+12 são e-mails isolados (benefício e case)", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 5)?.types).toEqual(["email"]);
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 12)?.types).toEqual(["email"]);
  });

  it("D+29 combina ligação e e-mail de encerramento", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 29)?.types).toEqual(["call", "email"]);
  });

  it("dias sem passo definido (ex.: 2, 4, 30) retornam undefined", () => {
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 2)).toBeUndefined();
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 4)).toBeUndefined();
    expect(findCadenceStep(DEFAULT_SDR_CADENCE_STEPS, 30)).toBeUndefined();
  });

  it("findCadenceStep funciona com uma régua customizada qualquer", () => {
    const custom = [{ dayOffset: 0, types: ["email" as const], label: "Só e-mail" }];
    expect(findCadenceStep(custom, 0)?.label).toBe("Só e-mail");
    expect(findCadenceStep(custom, 1)).toBeUndefined();
  });
});

describe("normalizeCadenceConfig", () => {
  it("config ausente cai pro padrão (3 cards/dia, SLA de 3 dias úteis, régua do documento)", () => {
    const cfg = normalizeCadenceConfig(null);
    expect(cfg.newCardsPerDay).toBe(3);
    expect(cfg.repFirstContactBusinessDays).toBe(3);
    expect(cfg.steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("respeita valores configurados dentro do intervalo válido", () => {
    const cfg = normalizeCadenceConfig({ sdr: { newCardsPerDay: 5 }, rep: { firstContactBusinessDays: 2 } });
    expect(cfg.newCardsPerDay).toBe(5);
    expect(cfg.repFirstContactBusinessDays).toBe(2);
  });

  it("valores fora do intervalo são limitados (clamp)", () => {
    const cfg = normalizeCadenceConfig({ sdr: { newCardsPerDay: 99 }, rep: { firstContactBusinessDays: 0 } });
    expect(cfg.newCardsPerDay).toBe(10);
    expect(cfg.repFirstContactBusinessDays).toBe(1);
  });

  it("aceita uma régua customizada válida", () => {
    const raw = {
      sdr: {
        steps: [
          { dayOffset: 0, types: ["call"], label: "Ligação inicial" },
          { dayOffset: 2, types: ["email", "whatsapp"], label: "Follow-up" },
        ],
      },
    };
    const cfg = normalizeCadenceConfig(raw);
    expect(cfg.steps).toEqual([
      { dayOffset: 0, types: ["call"], label: "Ligação inicial" },
      { dayOffset: 2, types: ["email", "whatsapp"], label: "Follow-up" },
    ]);
  });

  it("ordena os passos por dia mesmo se vierem fora de ordem", () => {
    const raw = { sdr: { steps: [
      { dayOffset: 5, types: ["email"], label: "Depois" },
      { dayOffset: 0, types: ["call"], label: "Início" },
    ] } };
    expect(normalizeCadenceConfig(raw).steps.map(s => s.dayOffset)).toEqual([0, 5]);
  });

  it("gera um rótulo a partir dos canais quando o label vem vazio", () => {
    const raw = { sdr: { steps: [{ dayOffset: 0, types: ["call", "email"], label: "" }] } };
    expect(normalizeCadenceConfig(raw).steps[0].label).toBe("Ligação + Email");
  });

  it("rejeita régua com dois passos no mesmo dia (cai pro padrão)", () => {
    const raw = { sdr: { steps: [
      { dayOffset: 0, types: ["call"], label: "A" },
      { dayOffset: 0, types: ["email"], label: "B" },
    ] } };
    expect(normalizeCadenceConfig(raw).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("rejeita régua sem passo no dia 0 (cai pro padrão)", () => {
    const raw = { sdr: { steps: [{ dayOffset: 1, types: ["call"], label: "A" }] } };
    expect(normalizeCadenceConfig(raw).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("rejeita passo sem nenhum canal válido (cai pro padrão)", () => {
    const raw = { sdr: { steps: [{ dayOffset: 0, types: [], label: "A" }] } };
    expect(normalizeCadenceConfig(raw).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("rejeita dayOffset fora do intervalo 0-90 (cai pro padrão)", () => {
    const raw = { sdr: { steps: [{ dayOffset: 200, types: ["call"], label: "A" }] } };
    expect(normalizeCadenceConfig(raw).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("régua ausente/vazia usa o padrão do documento", () => {
    expect(normalizeCadenceConfig({ sdr: {} }).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
    expect(normalizeCadenceConfig({ sdr: { steps: [] } }).steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });
});
