import { describe, it, expect } from "vitest";
import { buildSdrRanking, firstName, periodStartsBRT, type SdrEvent, type SdrUser } from "./rankingSdr";

// Sexta-feira, 25/09/2026, 15:00 BRT (18:00 UTC)
const NOW = new Date("2026-09-25T18:00:00Z");

const sdr = (id: string, name: string, extra: Partial<SdrUser> = {}): SdrUser => ({
  id, name, role: "sdr", isActive: true, productIds: ["wizmart", "smart_cafe"], ...extra,
});
const ev = (sdrId: string, kind: SdrEvent["kind"], iso: string, productId = "wizmart"): SdrEvent =>
  ({ sdrId, kind, at: new Date(iso), productId });

describe("periodStartsBRT", () => {
  it("dia começa 00h BRT (03h UTC)", () => {
    expect(periodStartsBRT(NOW).day.toISOString()).toBe("2026-09-25T03:00:00.000Z");
  });

  it("semana começa na segunda-feira", () => {
    expect(periodStartsBRT(NOW).week.toISOString()).toBe("2026-09-21T03:00:00.000Z");
  });

  it("mês começa no dia 1", () => {
    expect(periodStartsBRT(NOW).month.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("01h UTC ainda é o dia anterior no Brasil", () => {
    const s = periodStartsBRT(new Date("2026-09-26T01:00:00Z")); // 22h BRT de sexta
    expect(s.day.toISOString()).toBe("2026-09-25T03:00:00.000Z");
  });

  it("domingo pertence à semana que começou na segunda anterior", () => {
    const s = periodStartsBRT(new Date("2026-09-27T15:00:00Z")); // domingo
    expect(s.week.toISOString()).toBe("2026-09-21T03:00:00.000Z");
  });
});

describe("firstName", () => {
  it("devolve só o primeiro nome (o nó da TV é público)", () => {
    expect(firstName("Giovana Costa Lima")).toBe("Giovana");
  });
  it("nome vazio não quebra", () => {
    expect(firstName("")).toBe("SDR");
    expect(firstName(undefined)).toBe("SDR");
  });
});

describe("buildSdrRanking", () => {
  it("ordena pelo peso do pódio: visitas agendadas", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana"), sdr("b", "Bia"), sdr("c", "Cris")],
      events: [
        ev("a", "visit_scheduled", "2026-09-25T12:00:00Z"),
        ev("b", "visit_scheduled", "2026-09-25T12:00:00Z"),
        ev("b", "visit_scheduled", "2026-09-25T13:00:00Z"),
        ev("b", "visit_scheduled", "2026-09-25T14:00:00Z"),
      ],
      activities: [], productId: "all", now: NOW,
    });
    expect(r.day.map((x) => x.name)).toEqual(["Bia", "Ana", "Cris"]);
    expect(r.day[0].visits).toBe(3);
  });

  it("filtra por período: evento de ontem não conta no dia, conta na semana e no mês", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana")],
      events: [ev("a", "visit_scheduled", "2026-09-24T15:00:00Z")],
      activities: [], productId: "all", now: NOW,
    });
    expect(r.day[0].visits).toBe(0);
    expect(r.week[0].visits).toBe(1);
    expect(r.month[0].visits).toBe(1);
  });

  it("evento de semana passada só conta no mês", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana")],
      events: [ev("a", "meeting_done", "2026-09-10T15:00:00Z")],
      activities: [], productId: "all", now: NOW,
    });
    expect(r.week[0].meetingsDone).toBe(0);
    expect(r.month[0].meetingsDone).toBe(1);
  });

  it("empate em visitas: reuniões realizadas desempatam, depois % de atividades", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana"), sdr("b", "Bia"), sdr("c", "Cris")],
      events: [
        ev("a", "visit_scheduled", "2026-09-25T12:00:00Z"),
        ev("b", "visit_scheduled", "2026-09-25T12:00:00Z"),
        ev("b", "meeting_done", "2026-09-25T13:00:00Z"),
        ev("c", "visit_scheduled", "2026-09-25T12:00:00Z"),
      ],
      activities: [
        { userId: "c", status: "completed", createdAt: new Date("2026-09-25T10:00:00Z") },
      ],
      productId: "all", now: NOW,
    });
    expect(r.day.map((x) => x.name)).toEqual(["Bia", "Cris", "Ana"]);
  });

  it("atividades programadas x realizadas: ignora nota e pulada", () => {
    const at = new Date("2026-09-25T10:00:00Z");
    const r = buildSdrRanking({
      users: [sdr("a", "Ana")],
      events: [],
      activities: [
        { userId: "a", type: "call", status: "completed", createdAt: at },
        { userId: "a", type: "email", status: "pending", createdAt: at },
        { userId: "a", type: "note", status: "completed", createdAt: at },
        { userId: "a", type: "whatsapp", status: "skipped", createdAt: at },
      ],
      productId: "all", now: NOW,
    });
    expect(r.day[0]).toMatchObject({ actDone: 1, actTotal: 2, actPct: 50 });
  });

  it("só lista SDR ativo — inativo, rep e gestor ficam de fora", () => {
    const r = buildSdrRanking({
      users: [
        sdr("a", "Ana"),
        sdr("b", "Bia", { isActive: false }),
        { id: "c", name: "Carla", role: "rep", productIds: ["wizmart"] },
        { id: "d", name: "Duda", role: "manager", productIds: ["wizmart"] },
      ],
      events: [], activities: [], productId: "all", now: NOW,
    });
    expect(r.month.map((x) => x.name)).toEqual(["Ana"]);
  });

  it("respeita o produto do link", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana"), sdr("b", "Bia", { productIds: ["smart_cafe"] })],
      events: [
        ev("a", "visit_scheduled", "2026-09-25T12:00:00Z", "wizmart"),
        ev("a", "visit_scheduled", "2026-09-25T12:00:00Z", "smart_cafe"),
      ],
      activities: [], productId: "wizmart", now: NOW,
    });
    expect(r.day.map((x) => x.name)).toEqual(["Ana"]);
    expect(r.day[0].visits).toBe(1);
  });

  it("o payload público nunca carrega uid, e-mail ou nome completo", () => {
    const r = buildSdrRanking({
      users: [{ ...sdr("uid-secreto", "Giovana Costa Lima"), ...({ email: "g@x.com" } as object) }],
      events: [], activities: [], productId: "all", now: NOW,
    });
    const json = JSON.stringify(r);
    expect(json).not.toContain("uid-secreto");
    expect(json).not.toContain("g@x.com");
    expect(json).not.toContain("Costa");
    expect(r.day[0].name).toBe("Giovana");
  });

  it("SDR sem nenhum movimento aparece com zeros (não some do ranking)", () => {
    const r = buildSdrRanking({
      users: [sdr("a", "Ana")], events: [], activities: [], productId: "all", now: NOW,
    });
    expect(r.day[0]).toMatchObject({ visits: 0, meetingsDone: 0, meetingsScheduled: 0, actTotal: 0, actPct: 0 });
  });
});
