import { describe, it, expect } from "vitest";
import { countTodaysScheduledVisits, buildAgendaPushMessage } from "./repDailyAgendaPush";

describe("countTodaysScheduledVisits", () => {
  const now = new Date("2026-09-09T10:00:00-03:00");

  it("conta só os deals com visita marcada para hoje", () => {
    const deals = [
      { id: "a", visitScheduledAt: new Date("2026-09-09T08:00:00-03:00") },
      { id: "b", visitScheduledAt: new Date("2026-09-09T18:00:00-03:00") },
      { id: "c", visitScheduledAt: new Date("2026-09-08T23:59:00-03:00") }, // ontem
      { id: "d", visitScheduledAt: new Date("2026-09-10T00:00:01-03:00") }, // amanhã
    ];
    expect(countTodaysScheduledVisits(deals, now)).toBe(2);
  });

  it("ignora deals sem visitScheduledAt", () => {
    const deals = [{ id: "a" }, { id: "b", visitScheduledAt: undefined }];
    expect(countTodaysScheduledVisits(deals, now)).toBe(0);
  });

  it("aceita Timestamp do Firestore (via toDate())", () => {
    const deals = [
      { id: "a", visitScheduledAt: { toDate: () => new Date("2026-09-09T12:00:00-03:00") } },
    ];
    expect(countTodaysScheduledVisits(deals, now)).toBe(1);
  });

  it("zero deals agendados para hoje", () => {
    expect(countTodaysScheduledVisits([], now)).toBe(0);
  });
});

describe("buildAgendaPushMessage", () => {
  it("singular para 1 visita", () => {
    expect(buildAgendaPushMessage(1)).toEqual({
      title: "Sua agenda de hoje",
      body: "Você tem 1 visita agendada para hoje.",
    });
  });

  it("plural para mais de 1 visita", () => {
    expect(buildAgendaPushMessage(3)).toEqual({
      title: "Sua agenda de hoje",
      body: "Você tem 3 visitas agendadas para hoje.",
    });
  });
});
