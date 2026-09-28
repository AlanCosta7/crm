import { describe, it, expect } from "vitest";
import {
  AGENDA_FOLLOWUP_GAP_DAYS,
  AGENDA_TRIGGER_STAGES,
  agendaActivityType,
  agendaTaskLabel,
  buildAgendaSchedule,
  subtractBusinessDays,
} from "./agendaRuler";

/** 2026-09-10 é uma quinta-feira. Referência de todos os casos abaixo. */
const QUINTA_10 = new Date("2026-09-10T13:00:00Z"); // 10h BRT

describe("subtractBusinessDays", () => {
  it("um dia útil antes de quinta é quarta", () => {
    expect(subtractBusinessDays(QUINTA_10, 1).toISOString()).toBe("2026-09-09T13:00:00.000Z");
  });

  // O ponto da expressão "24h úteis": o fim de semana não conta.
  it("um dia útil antes de segunda é sexta, não domingo", () => {
    const segunda = new Date("2026-09-14T13:00:00Z");
    expect(subtractBusinessDays(segunda, 1).toISOString()).toBe("2026-09-11T13:00:00.000Z");
  });

  it("preserva a hora do compromisso", () => {
    const tarde = new Date("2026-09-10T20:30:00Z"); // 17h30 BRT
    expect(subtractBusinessDays(tarde, 1).toISOString()).toBe("2026-09-09T20:30:00.000Z");
  });

  it("dois dias úteis antes de segunda é quinta", () => {
    const segunda = new Date("2026-09-14T13:00:00Z");
    expect(subtractBusinessDays(segunda, 2).toISOString()).toBe("2026-09-10T13:00:00.000Z");
  });

  it("compromisso no sábado recua para a sexta mesmo com 0 dias", () => {
    const sabado = new Date("2026-09-12T13:00:00Z");
    expect(subtractBusinessDays(sabado, 0).toISOString()).toBe("2026-09-11T13:00:00.000Z");
  });

  // Um compromisso na segunda 1h UTC é domingo 22h em BRT: recuar pelo dia UTC
  // daria sexta, quando o certo é quinta.
  it("usa o dia da semana em BRT, não em UTC", () => {
    const segundaUtcDomingoBrt = new Date("2026-09-14T01:00:00Z");
    const r = subtractBusinessDays(segundaUtcDomingoBrt, 1);
    // Domingo 22h BRT → recua para sexta 22h BRT = sábado 01h UTC
    expect(r.toISOString()).toBe("2026-09-12T01:00:00.000Z");
  });
});

describe("buildAgendaSchedule", () => {
  it("monta follow-ups de 3 em 3 dias e a confirmação por último", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const evento = new Date("2026-09-15T13:00:00Z"); // terça, 14 dias à frente
    const r = buildAgendaSchedule(agora, evento);

    expect(r[r.length - 1].kind).toBe("confirmation");
    const fups = r.filter(t => t.kind === "followup");
    expect(fups.length).toBeGreaterThan(0);

    // Intervalo de exatamente 3 dias entre follow-ups consecutivos.
    for (let i = 1; i < fups.length; i++) {
      const dias = (fups[i].at.getTime() - fups[i - 1].at.getTime()) / 86_400_000;
      expect(dias).toBe(AGENDA_FOLLOWUP_GAP_DAYS);
    }
  });

  it("a confirmação cai 24h úteis antes do compromisso", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const evento = new Date("2026-09-14T13:00:00Z"); // segunda
    const r = buildAgendaSchedule(agora, evento);
    const confirmacao = r.find(t => t.kind === "confirmation")!;
    expect(confirmacao.at.toISOString()).toBe("2026-09-11T13:00:00.000Z"); // sexta
  });

  it("nenhum follow-up é agendado depois da confirmação", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const evento = new Date("2026-09-20T13:00:00Z");
    const r = buildAgendaSchedule(agora, evento);
    const confirmacao = r.find(t => t.kind === "confirmation")!;
    for (const f of r.filter(t => t.kind === "followup")) {
      expect(f.at.getTime()).toBeLessThan(confirmacao.at.getTime());
    }
  });

  it("o primeiro follow-up é 3 dias depois do agendamento, não hoje", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const r = buildAgendaSchedule(agora, new Date("2026-09-20T13:00:00Z"));
    const primeiro = r.find(t => t.kind === "followup")!;
    expect((primeiro.at.getTime() - agora.getTime()) / 86_400_000).toBe(3);
  });

  it("numera os follow-ups para o rótulo", () => {
    const r = buildAgendaSchedule(new Date("2026-09-01T13:00:00Z"), new Date("2026-09-20T13:00:00Z"));
    const fups = r.filter(t => t.kind === "followup");
    expect(fups.map(f => f.index)).toEqual(fups.map((_, i) => i + 1));
    expect(fups.every(f => f.total === fups.length)).toBe(true);
  });

  // Compromisso perto: só confirmação, sem follow-up (que cairia depois dela).
  it("compromisso em 2 dias gera só a confirmação", () => {
    const agora = new Date("2026-09-08T13:00:00Z"); // terça
    const evento = new Date("2026-09-10T13:00:00Z"); // quinta
    const r = buildAgendaSchedule(agora, evento);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("confirmation");
  });

  // Criar tarefa já vencida só geraria alerta de atraso para algo impossível.
  it("compromisso amanhã não gera régua nenhuma", () => {
    const agora = new Date("2026-09-09T18:00:00Z");
    const evento = new Date("2026-09-10T13:00:00Z");
    expect(buildAgendaSchedule(agora, evento)).toEqual([]);
  });

  it("compromisso hoje não gera régua", () => {
    const agora = new Date("2026-09-10T09:00:00Z");
    expect(buildAgendaSchedule(agora, QUINTA_10)).toEqual([]);
  });

  it("compromisso no passado não gera régua", () => {
    const agora = new Date("2026-09-20T13:00:00Z");
    expect(buildAgendaSchedule(agora, QUINTA_10)).toEqual([]);
  });

  it("data inválida não gera régua nem lança", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    expect(buildAgendaSchedule(agora, new Date("nada"))).toEqual([]);
    expect(buildAgendaSchedule(agora, undefined as unknown as Date)).toEqual([]);
  });

  it("toda tarefa fica entre agora e o compromisso", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const evento = new Date("2026-10-01T13:00:00Z");
    for (const t of buildAgendaSchedule(agora, evento)) {
      expect(t.at.getTime()).toBeGreaterThan(agora.getTime());
      expect(t.at.getTime()).toBeLessThan(evento.getTime());
    }
  });

  it("compromisso distante gera vários follow-ups antes da confirmação", () => {
    const agora = new Date("2026-09-01T13:00:00Z");
    const r = buildAgendaSchedule(agora, new Date("2026-10-01T13:00:00Z"));
    expect(r.filter(t => t.kind === "followup").length).toBeGreaterThanOrEqual(8);
    expect(r.filter(t => t.kind === "confirmation")).toHaveLength(1);
  });
});

describe("etapas que disparam a régua", () => {
  it("reunião e visita do WizMart, degustação do Smart Café", () => {
    expect(AGENDA_TRIGGER_STAGES.reuniao_agendada).toBe("meeting_scheduled");
    expect(AGENDA_TRIGGER_STAGES.visita_agendada).toBe("visit_scheduled");
    expect(AGENDA_TRIGGER_STAGES.degustacao_agendada).toBe("visit_scheduled");
  });

  it("etapa que não é agendamento não dispara", () => {
    expect(AGENDA_TRIGGER_STAGES.prospeccao).toBeUndefined();
    expect(AGENDA_TRIGGER_STAGES.reuniao_realizada).toBeUndefined();
    expect(AGENDA_TRIGGER_STAGES.conectado).toBeUndefined();
  });
});

describe("agendaActivityType", () => {
  // Follow-up de reunião NÃO é reunião: com `meeting`, todo indicador de
  // "Reuniões Agendadas" contaria cada follow-up como uma reunião a mais.
  it("usa o tipo próprio 'agenda' para reunião e para visita", () => {
    expect(agendaActivityType("meeting_scheduled")).toBe("agenda");
    expect(agendaActivityType("visit_scheduled")).toBe("agenda");
  });

  it("nunca devolve os tipos que os indicadores contam como reunião ou visita", () => {
    for (const r of ["meeting_scheduled", "visit_scheduled"] as const) {
      expect(["meeting", "visit"]).not.toContain(agendaActivityType(r));
    }
  });
});

describe("agendaTaskLabel", () => {
  it("rotula a confirmação citando as 24h úteis", () => {
    const r = agendaTaskLabel({ kind: "confirmation", at: QUINTA_10 }, "meeting_scheduled");
    expect(r).toBe("Confirmar a reunião com o cliente (24h úteis antes)");
  });

  it("rotula a visita como visita", () => {
    const r = agendaTaskLabel({ kind: "confirmation", at: QUINTA_10 }, "visit_scheduled");
    expect(r).toContain("visita");
  });

  it("numera o follow-up quando há mais de um", () => {
    const r = agendaTaskLabel({ kind: "followup", at: QUINTA_10, index: 2, total: 3 }, "meeting_scheduled");
    expect(r).toBe("Follow-up 2/3 até a reunião");
  });

  it("não numera quando é o único follow-up", () => {
    const r = agendaTaskLabel({ kind: "followup", at: QUINTA_10, index: 1, total: 1 }, "visit_scheduled");
    expect(r).toBe("Follow-up até a visita");
  });
});
