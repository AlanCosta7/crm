import { describe, it, expect } from "vitest";
import {
  assertCanImpersonate,
  assertCanEndImpersonation,
  type CallerClaims,
  type TargetUser,
} from "./impersonationRules";

const master: CallerClaims = { uid: "master-001", role: "master", tenantId: "wizmart" };

const sdr: TargetUser = { id: "sdr-001", tenantId: "wizmart", role: "sdr", isActive: true };

describe("assertCanImpersonate", () => {
  it("permite master impersonar usuário ativo do mesmo tenant", () => {
    expect(assertCanImpersonate(master, sdr)).toEqual({ ok: true });
  });

  it("bloqueia quem não é master — inclusive impersonação aninhada", () => {
    // Sessão de alguém já impersonando um SDR: o JWT real tem role 'sdr'
    const dentroDeUmaImpersonacao: CallerClaims = { uid: "sdr-001", role: "sdr", tenantId: "wizmart" };
    const veredito = assertCanImpersonate(dentroDeUmaImpersonacao, { ...sdr, id: "rep-001" });
    expect(veredito).toEqual({ ok: false, code: "not-master", message: expect.any(String) });
  });

  it("bloqueia manager — só master tem a capacidade", () => {
    const manager: CallerClaims = { uid: "manager-001", role: "manager", tenantId: "wizmart" };
    expect(assertCanImpersonate(manager, sdr).ok).toBe(false);
  });

  it("bloqueia impersonar a si mesmo", () => {
    const veredito = assertCanImpersonate(master, { ...sdr, id: "master-001" });
    expect(veredito).toEqual({ ok: false, code: "self", message: expect.any(String) });
  });

  it("bloqueia usuário de outro tenant, mesmo com uid válido", () => {
    const veredito = assertCanImpersonate(master, { ...sdr, tenantId: "outro-tenant" });
    expect(veredito).toEqual({ ok: false, code: "cross-tenant", message: expect.any(String) });
  });

  it("bloqueia usuário desativado", () => {
    const veredito = assertCanImpersonate(master, { ...sdr, isActive: false });
    expect(veredito).toEqual({ ok: false, code: "inactive", message: expect.any(String) });
  });

  it("bloqueia alvo inexistente", () => {
    expect(assertCanImpersonate(master, null)).toEqual({
      ok: false,
      code: "not-found",
      message: expect.any(String),
    });
  });

  it("trata role ausente na claim como não-master", () => {
    const semRole: CallerClaims = { uid: "x", tenantId: "wizmart" };
    expect(assertCanImpersonate(semRole, sdr).ok).toBe(false);
  });

  it("usuário sem isActive definido é tratado como ativo (default)", () => {
    const semFlag: TargetUser = { id: "bdr-001", tenantId: "wizmart", role: "bdr" };
    expect(assertCanImpersonate(master, semFlag)).toEqual({ ok: true });
  });
});

describe("assertCanEndImpersonation", () => {
  it("o próprio impersonado encerra a própria sessão de teste", () => {
    expect(assertCanEndImpersonation("sdr-001", "sdr", "sdr-001")).toEqual({ ok: true });
  });

  it("qualquer master encerra a impersonação de qualquer alvo", () => {
    // Cobre o caso de a aba original ter fechado (sem returnToken guardado) —
    // outro login de master ainda consegue limpar o doc órfão.
    expect(assertCanEndImpersonation("master-002", "master", "sdr-001")).toEqual({ ok: true });
  });

  it("bloqueia terceiro sem ser master nem o próprio alvo", () => {
    const veredito = assertCanEndImpersonation("rep-001", "rep", "sdr-001");
    expect(veredito).toEqual({ ok: false, code: "not-master", message: expect.any(String) });
  });

  it("trata role ausente como não-master", () => {
    expect(assertCanEndImpersonation("x", undefined, "sdr-001").ok).toBe(false);
  });
});
