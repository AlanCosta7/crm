import { describe, it, expect } from "vitest";
import {
  claimsMatch,
  derrubaUltimoMaster,
  desiredClaims,
  sameStringArray,
  type DesiredClaims,
} from "./userClaimsRules";

const TID = "wizmart_sp";

describe("desiredClaims", () => {
  it("copia papel e produtos válidos do documento", () => {
    expect(desiredClaims(TID, { role: "sdr", productIds: ["wizmart", "smart_cafe"] })).toEqual({
      tenantId: TID,
      role: "sdr",
      productIds: ["wizmart", "smart_cafe"],
    });
  });

  it("papel ausente cai em viewer, NUNCA em master", () => {
    expect(desiredClaims(TID, {}).role).toBe("viewer");
  });

  it("papel inválido cai em viewer", () => {
    expect(desiredClaims(TID, { role: "superadmin" }).role).toBe("viewer");
    expect(desiredClaims(TID, { role: 42 }).role).toBe("viewer");
  });

  it("aceita todos os 8 papéis do inviteUser (financeiro entrou na Fase 5.4)", () => {
    for (const role of ["master", "manager", "bdr", "sdr", "rep", "design", "viewer", "financeiro"]) {
      expect(desiredClaims(TID, { role }).role).toBe(role);
    }
  });

  it("produtos vazios ou inválidos caem em ['wizmart']", () => {
    expect(desiredClaims(TID, { productIds: [] }).productIds).toEqual(["wizmart"]);
    expect(desiredClaims(TID, { productIds: "wizmart" }).productIds).toEqual(["wizmart"]);
    expect(desiredClaims(TID, {}).productIds).toEqual(["wizmart"]);
  });

  it("descarta entradas não-string da lista de produtos", () => {
    expect(desiredClaims(TID, { productIds: ["wizmart", null, 7, ""] }).productIds).toEqual(["wizmart"]);
  });
});

describe("sameStringArray", () => {
  it("ignora a ordem", () => {
    expect(sameStringArray(["b", "a"], ["a", "b"])).toBe(true);
  });

  it("distingue tamanho e conteúdo", () => {
    expect(sameStringArray(["a"], ["a", "b"])).toBe(false);
    expect(sameStringArray(["a", "c"], ["a", "b"])).toBe(false);
  });

  it("não-array nunca casa", () => {
    expect(sameStringArray(undefined, ["a"])).toBe(false);
    expect(sameStringArray("a", ["a"])).toBe(false);
  });
});

describe("claimsMatch", () => {
  const desired: DesiredClaims = { tenantId: TID, role: "sdr", productIds: ["wizmart"] };

  it("casa quando token e documento concordam", () => {
    expect(claimsMatch({ tenantId: TID, role: "sdr", productIds: ["wizmart"] }, desired)).toBe(true);
  });

  it("casa mesmo com claims extras no token (ex.: legado)", () => {
    expect(claimsMatch({ tenantId: TID, role: "sdr", productIds: ["wizmart"], legado: 1 }, desired)).toBe(true);
  });

  it("não casa quando o papel mudou — é o gatilho da regravação", () => {
    expect(claimsMatch({ tenantId: TID, role: "manager", productIds: ["wizmart"] }, desired)).toBe(false);
  });

  it("não casa quando os produtos mudaram", () => {
    expect(claimsMatch({ tenantId: TID, role: "sdr", productIds: ["smart_cafe"] }, desired)).toBe(false);
  });

  it("não casa quando o tenant mudou", () => {
    expect(claimsMatch({ tenantId: "outro", role: "sdr", productIds: ["wizmart"] }, desired)).toBe(false);
  });

  it("conta sem claim nenhuma não casa", () => {
    expect(claimsMatch(undefined, desired)).toBe(false);
    expect(claimsMatch({}, desired)).toBe(false);
  });

  // Este é o teste que protege a sessão do usuário: users/{uid} é reescrito a
  // cada moeda/ponto, e sem o short-circuit cada escrita revogaria o login.
  it("escrita que não toca em permissão é vista como já sincronizada", () => {
    const doc = { role: "sdr", productIds: ["wizmart"], coinBalance: 999, points: 120 };
    expect(claimsMatch({ tenantId: TID, role: "sdr", productIds: ["wizmart"] }, desiredClaims(TID, doc))).toBe(true);
  });
});

describe("derrubaUltimoMaster", () => {
  const masterAtivo = { role: "master", isActive: true };

  it("bloqueia rebaixar o último master ativo", () => {
    expect(derrubaUltimoMaster({
      antes: masterAtivo, papelDepois: "manager", bloqueadoDepois: false, outrosMastersAtivos: 0,
    })).toBe(true);
  });

  it("bloqueia bloquear o último master ativo", () => {
    expect(derrubaUltimoMaster({
      antes: masterAtivo, papelDepois: "master", bloqueadoDepois: true, outrosMastersAtivos: 0,
    })).toBe(true);
  });

  it("permite rebaixar quando existe outro master ativo", () => {
    expect(derrubaUltimoMaster({
      antes: masterAtivo, papelDepois: "sdr", bloqueadoDepois: false, outrosMastersAtivos: 1,
    })).toBe(false);
  });

  it("permite mudanças que mantêm o master ativo (ex.: só trocou produtos)", () => {
    expect(derrubaUltimoMaster({
      antes: masterAtivo, papelDepois: "master", bloqueadoDepois: false, outrosMastersAtivos: 0,
    })).toBe(false);
  });

  it("não interfere em quem não era master", () => {
    expect(derrubaUltimoMaster({
      antes: { role: "sdr", isActive: true }, papelDepois: "viewer", bloqueadoDepois: true, outrosMastersAtivos: 0,
    })).toBe(false);
  });

  it("não interfere em master que já estava bloqueado", () => {
    expect(derrubaUltimoMaster({
      antes: { role: "master", isActive: false }, papelDepois: "sdr", bloqueadoDepois: true, outrosMastersAtivos: 0,
    })).toBe(false);
  });

  it("documento novo (sem estado anterior) nunca derruba ninguém", () => {
    expect(derrubaUltimoMaster({
      antes: null, papelDepois: "viewer", bloqueadoDepois: false, outrosMastersAtivos: 0,
    })).toBe(false);
  });

  it("master sem isActive definido é tratado como ativo", () => {
    expect(derrubaUltimoMaster({
      antes: { role: "master" }, papelDepois: "manager", bloqueadoDepois: false, outrosMastersAtivos: 0,
    })).toBe(true);
  });
});
