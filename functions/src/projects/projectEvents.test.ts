import { describe, it, expect } from "vitest";
import {
  requestedEvent, inProgressEvent, deliveredEvent, designRecipients,
  requestedNotifications, deliveredNotification, pdvLabels,
} from "./projectEvents";

const proj = {
  dealId: "d1", companyName: "CSN", requestedBy: "rep-1", requestedByName: "Carla Rep",
  pdvTypes: ["nanomarket", "store"], assignedToDesignerId: "des-1",
};

describe("eventos da timeline do card", () => {
  it("solicitado: quem pediu e o tipo de PDV com o rótulo do cliente (Loja)", () => {
    const e = requestedEvent(proj);
    expect(e.type).toBe("project_requested");
    expect(e.message).toContain("Carla Rep");
    expect(e.message).toContain("Nanomarket + Loja");
    expect(e.message).not.toContain("store");
    expect(e.createdBy).toBe("rep-1");
  });

  it("em andamento: traz o NOME do designer, não o uid", () => {
    const e = inProgressEvent(proj, "Fernanda");
    expect(e.type).toBe("project_in_progress");
    expect(e.message).toContain("Fernanda");
    expect(e.message).not.toContain("des-1");
  });

  it("entregue: nome do designer e links dos arquivos entregues", () => {
    const e = deliveredEvent(
      { ...proj, deliveredAttachments: [{ name: "layout.pdf", url: "https://x/l.pdf" }], deliveredFileUrl: "https://drive/x" },
      "Fernanda",
    );
    expect(e.type).toBe("project_delivered");
    expect(e.message).toContain("Fernanda");
    expect(e.links).toEqual([
      { label: "layout.pdf", url: "https://x/l.pdf" },
      { label: "Abrir link do projeto", url: "https://drive/x" },
    ]);
  });

  it("entrega sem nenhum arquivo nem link não inventa `links`", () => {
    expect(deliveredEvent(proj, "F").links).toBeUndefined();
  });

  it("anexo sem url é ignorado", () => {
    const e = deliveredEvent({ ...proj, deliveredAttachments: [{ name: "x" }] }, "F");
    expect(e.links).toBeUndefined();
  });

  it("sem tipo de PDV cai em 'PDV'", () => {
    expect(pdvLabels(undefined)).toBe("PDV");
    expect(pdvLabels([])).toBe("PDV");
  });
});

describe("notificações", () => {
  it("só usuário Design ATIVO é avisado de pedido novo", () => {
    const r = designRecipients([
      { id: "a", role: "design", isActive: true },
      { id: "b", role: "design", isActive: false },
      { id: "c", role: "rep" },
      { id: "d", role: "design" },
    ]);
    expect(r).toEqual(["a", "d"]);
  });

  it("pedido novo leva o Design direto para a fila", () => {
    const n = requestedNotifications(proj, ["des-1", "des-2"]);
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ userId: "des-1", link: "/design-queue", dealId: "d1" });
  });

  it("entrega avisa quem pediu, e leva ao card", () => {
    const n = deliveredNotification(proj, "Fernanda");
    expect(n).toMatchObject({ userId: "rep-1", dealId: "d1", type: "project_delivered" });
    expect(n?.link).toBeUndefined();
  });

  it("sem solicitante identificado, não há a quem avisar", () => {
    expect(deliveredNotification({ ...proj, requestedBy: undefined }, "F")).toBeNull();
  });
});
