import { describe, it, expect, vi } from "vitest";
import { recordSdrEvent, sdrEventKindForStage } from "./sdrEvents";

describe("sdrEventKindForStage", () => {
  it("mapeia as etapas que o cliente quer contar", () => {
    expect(sdrEventKindForStage("reuniao_agendada")).toBe("meeting_scheduled");
    expect(sdrEventKindForStage("reuniao_realizada")).toBe("meeting_done");
    expect(sdrEventKindForStage("visita_agendada")).toBe("visit_scheduled");
    expect(sdrEventKindForStage("degustacao_agendada")).toBe("visit_scheduled");
  });
  it("outras etapas não geram evento", () => {
    expect(sdrEventKindForStage("prospeccao")).toBeNull();
    expect(sdrEventKindForStage("visita_realizada")).toBeNull();
  });
});

function fakeDb(create: () => Promise<void>) {
  const doc = vi.fn().mockReturnValue({ create });
  return { db: { doc } as any, doc };
}

describe("recordSdrEvent", () => {
  it("grava com id determinístico (deal + tipo)", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const { db, doc } = fakeDb(create);
    const ok = await recordSdrEvent(db, "t1", { id: "d1", stage: "visita_agendada", assignedSdrId: "sdr-1" });
    expect(ok).toBe(true);
    expect(doc).toHaveBeenCalledWith("tenants/t1/sdr_events/d1__visit_scheduled");
    expect(create.mock.calls[0][0]).toMatchObject({ sdrId: "sdr-1", dealId: "d1", kind: "visit_scheduled" });
  });

  it("card que já passou pela etapa não conta de novo (ALREADY_EXISTS)", async () => {
    const { db } = fakeDb(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: 6 })));
    expect(await recordSdrEvent(db, "t1", { id: "d1", stage: "visita_agendada", assignedSdrId: "s" })).toBe(false);
  });

  it("sem SDR atribuído não grava nada", async () => {
    const create = vi.fn();
    const { db } = fakeDb(create);
    expect(await recordSdrEvent(db, "t1", { id: "d1", stage: "visita_agendada" })).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("etapa irrelevante não grava nada", async () => {
    const create = vi.fn();
    const { db } = fakeDb(create);
    expect(await recordSdrEvent(db, "t1", { id: "d1", stage: "prospeccao", assignedSdrId: "s" })).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("erro que não é ALREADY_EXISTS sobe (não some em silêncio)", async () => {
    const { db } = fakeDb(vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { code: 13 })));
    await expect(recordSdrEvent(db, "t1", { id: "d1", stage: "visita_agendada", assignedSdrId: "s" })).rejects.toThrow("boom");
  });
});
