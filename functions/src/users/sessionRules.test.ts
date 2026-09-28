import { describe, it, expect } from "vitest";
import { assertCanEndSession, type CallerClaims, type TargetUser } from "./sessionRules";

const master: CallerClaims = { uid: "master-001", role: "master", tenantId: "wizmart" };
const manager: CallerClaims = { uid: "manager-001", role: "manager", tenantId: "wizmart" };
const sdr: CallerClaims = { uid: "sdr-001", role: "sdr", tenantId: "wizmart" };

const target: TargetUser = { id: "rep-001", tenantId: "wizmart" };

describe("assertCanEndSession", () => {
  it("master pode encerrar a sessão de outro usuário", () => {
    expect(assertCanEndSession(master, target)).toEqual({ ok: true });
  });

  it("manager também pode — diferente do bloqueio de acesso, que é só master", () => {
    expect(assertCanEndSession(manager, target)).toEqual({ ok: true });
  });

  it("SDR não pode encerrar a sessão de ninguém", () => {
    const v = assertCanEndSession(sdr, target);
    expect(v).toEqual({ ok: false, code: "not-authorized", message: expect.any(String) });
  });

  it("bloqueia encerrar a própria sessão por este caminho", () => {
    const v = assertCanEndSession(master, { id: master.uid, tenantId: "wizmart" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("self");
  });

  it("bloqueia usuário de outro tenant", () => {
    const v = assertCanEndSession(master, { id: "rep-999", tenantId: "outro-tenant" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("cross-tenant");
  });

  it("bloqueia alvo inexistente", () => {
    const v = assertCanEndSession(master, null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("not-found");
  });

  it("papel ausente no token nunca autoriza", () => {
    const v = assertCanEndSession({ uid: "x", tenantId: "wizmart" }, target);
    expect(v.ok).toBe(false);
  });
});
