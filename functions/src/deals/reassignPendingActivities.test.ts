import { describe, expect, it } from "vitest";
import { responsibleChanges, stripActivitiesFromQueue } from "./reassignPendingActivities";

describe("responsibleChanges", () => {
  it("SDR trocado: 'de → para'", () => {
    expect(responsibleChanges({ assignedSdrId: "sdr-1" }, { assignedSdrId: "sdr-2" }))
      .toEqual([{ field: "assignedSdrId", oldUid: "sdr-1", newUid: "sdr-2" }]);
  });

  it("Rep trocado", () => {
    expect(responsibleChanges({ assignedRepId: "rep-1" }, { assignedRepId: "rep-2" }))
      .toEqual([{ field: "assignedRepId", oldUid: "rep-1", newUid: "rep-2" }]);
  });

  it("primeira atribuição (antes vazio) não é troca — não há atividade de ninguém pra mover", () => {
    expect(responsibleChanges({}, { assignedSdrId: "sdr-1" })).toEqual([]);
    expect(responsibleChanges({ assignedSdrId: "" }, { assignedSdrId: "sdr-1" })).toEqual([]);
  });

  it("limpeza (declineHandoff / devolução ao BDR) não é troca — não há novo responsável", () => {
    expect(responsibleChanges({ assignedRepId: "rep-1" }, { assignedRepId: "" })).toEqual([]);
    expect(responsibleChanges({ assignedSdrId: "sdr-1" }, {})).toEqual([]);
  });

  it("nada mudou (ex.: a CF de campos derivados reescrevendo o deal)", () => {
    expect(responsibleChanges({ assignedSdrId: "sdr-1", responsibleId: "sdr-1" }, { assignedSdrId: "sdr-1", responsibleId: "sdr-1", participantIds: ["sdr-1"] })).toEqual([]);
  });

  it("SDR e Rep trocados no mesmo update geram duas trocas", () => {
    const changes = responsibleChanges(
      { assignedSdrId: "sdr-1", assignedRepId: "rep-1" },
      { assignedSdrId: "sdr-2", assignedRepId: "rep-2" },
    );
    expect(changes.map(c => c.field)).toEqual(["assignedSdrId", "assignedRepId"]);
  });

  it("documento ausente (criação/exclusão)", () => {
    expect(responsibleChanges(undefined, { assignedSdrId: "sdr-1" })).toEqual([]);
    expect(responsibleChanges({ assignedSdrId: "sdr-1" }, undefined)).toEqual([]);
  });
});

describe("stripActivitiesFromQueue", () => {
  const queue = {
    activitiesRequired: 5,
    cards: [
      { dealId: "d1", activities: { call: { activityId: "a1" }, email: { activityId: "a2" } } },
      { dealId: "d2", activities: { whatsapp: { activityId: "a3" }, call: { activityId: "a4" } } },
    ],
  };

  it("tira só as atividades movidas; o card com sobra continua", () => {
    const r = stripActivitiesFromQueue(queue, "d2", new Set(["a3"]));
    expect(r.removed).toBe(1);
    expect(r.activitiesRequired).toBe(4);
    expect(r.cardsDistributed).toBe(2);
    expect(Object.keys(r.cards[1].activities)).toEqual(["call"]);
  });

  it("card que fica sem atividade some da fila", () => {
    const r = stripActivitiesFromQueue(queue, "d1", new Set(["a1", "a2"]));
    expect(r.removed).toBe(2);
    expect(r.cards.map(c => c.dealId)).toEqual(["d2"]);
    expect(r.cardsDistributed).toBe(1);
    expect(r.activitiesRequired).toBe(3);
  });

  it("não toca em outros cards, nem em ids de outro deal", () => {
    const r = stripActivitiesFromQueue(queue, "d1", new Set(["a3"]));
    expect(r.removed).toBe(0);
    expect(r.cards).toEqual(queue.cards);
    expect(r.activitiesRequired).toBe(5);
  });

  it("contador nunca fica negativo", () => {
    const r = stripActivitiesFromQueue({ ...queue, activitiesRequired: 0 }, "d1", new Set(["a1"]));
    expect(r.activitiesRequired).toBe(0);
  });
});
