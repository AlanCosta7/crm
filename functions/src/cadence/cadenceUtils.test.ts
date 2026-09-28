import { describe, expect, it } from "vitest";
import {
  normalizeCadenceConfig,
  findCadenceStep,
  DEFAULT_SDR_CADENCE_STEPS,
} from "./cadenceUtils";

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
  it("config ausente cai pro padrão (SLA de 3 dias úteis, régua do documento)", () => {
    const cfg = normalizeCadenceConfig(null);
    expect(cfg.repFirstContactBusinessDays).toBe(3);
    expect(cfg.steps).toEqual(DEFAULT_SDR_CADENCE_STEPS);
  });

  it("respeita valores configurados dentro do intervalo válido", () => {
    const cfg = normalizeCadenceConfig({ rep: { firstContactBusinessDays: 2 } });
    expect(cfg.repFirstContactBusinessDays).toBe(2);
  });

  it("valores fora do intervalo são limitados (clamp)", () => {
    const cfg = normalizeCadenceConfig({ rep: { firstContactBusinessDays: 0 } });
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
