import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizePhoneBR,
  parseLeadPayload,
  toLeadData,
  toTracking,
  MAX_CUSTOM_FIELDS,
} from "./validation";

const validBody = {
  name: "Maria Silva",
  email: "maria@empresa.com.br",
  phone: "(11) 98765-4321",
  company: "Mercado Bom Preço",
  message: "Quero saber mais",
};

describe("normalizeEmail", () => {
  it("normaliza caixa e espaços", () => {
    expect(normalizeEmail("  Maria@Empresa.COM.br ")).toBe("maria@empresa.com.br");
  });

  it("null para valores sem @, vazios ou não-string", () => {
    expect(normalizeEmail("sem-arroba")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhoneBR", () => {
  it.each([
    ["(11) 98765-4321", "11987654321"],
    ["11 98765 4321", "11987654321"],
    ["+55 11 98765-4321", "11987654321"],
    ["5511987654321", "11987654321"],
    ["005511987654321", "11987654321"],
    ["011 98765-4321", "11987654321"],
    ["(31) 3222-1000", "3132221000"],
  ])("normaliza %s → %s", (input, expected) => {
    expect(normalizePhoneBR(input)).toBe(expected);
  });

  it("null para telefones implausíveis", () => {
    expect(normalizePhoneBR("123")).toBeNull();
    expect(normalizePhoneBR("123456789012345")).toBeNull();
    expect(normalizePhoneBR("abc")).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR(undefined)).toBeNull();
  });
});

describe("parseLeadPayload", () => {
  it("aceita payload completo válido", () => {
    const r = parseLeadPayload(validBody);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Maria Silva");
      expect(r.data.email).toBe("maria@empresa.com.br");
    }
  });

  it("aceita só nome + email, ou só nome + telefone", () => {
    expect(parseLeadPayload({ name: "Ana", email: "a@b.com" }).ok).toBe(true);
    expect(parseLeadPayload({ name: "Ana", phone: "11987654321" }).ok).toBe(true);
  });

  it("rejeita sem email E sem telefone válido", () => {
    const r = parseLeadPayload({ name: "Ana" });
    expect(r.ok).toBe(false);
    expect(parseLeadPayload({ name: "Ana", phone: "123" }).ok).toBe(false);
  });

  it("rejeita email malformado", () => {
    expect(parseLeadPayload({ name: "Ana", email: "não-é-email" }).ok).toBe(false);
  });

  it("normaliza email p/ minúsculas e trim no nome", () => {
    const r = parseLeadPayload({ name: "  Ana  ", email: "ANA@B.COM" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Ana");
      expect(r.data.email).toBe("ana@b.com");
    }
  });

  it("rejeita nome curto, ausente ou gigante", () => {
    expect(parseLeadPayload({ name: "A", email: "a@b.com" }).ok).toBe(false);
    expect(parseLeadPayload({ email: "a@b.com" }).ok).toBe(false);
    expect(parseLeadPayload({ name: "x".repeat(121), email: "a@b.com" }).ok).toBe(false);
  });

  it("rejeita body que não é objeto", () => {
    expect(parseLeadPayload(null).ok).toBe(false);
    expect(parseLeadPayload("string").ok).toBe(false);
    expect(parseLeadPayload([1, 2]).ok).toBe(false);
    expect(parseLeadPayload(undefined).ok).toBe(false);
  });

  it("rejeita mensagem acima de 2000 chars (payload malicioso)", () => {
    expect(
      parseLeadPayload({ ...validBody, message: "x".repeat(2001) }).ok
    ).toBe(false);
  });

  it(`rejeita mais de ${MAX_CUSTOM_FIELDS} campos custom`, () => {
    const custom = Object.fromEntries(
      Array.from({ length: MAX_CUSTOM_FIELDS + 1 }, (_, i) => [`k${i}`, "v"])
    );
    expect(parseLeadPayload({ ...validBody, custom }).ok).toBe(false);
    const okCustom = Object.fromEntries(
      Array.from({ length: MAX_CUSTOM_FIELDS }, (_, i) => [`k${i}`, "v"])
    );
    expect(parseLeadPayload({ ...validBody, custom: okCustom }).ok).toBe(true);
  });

  it("rejeita valor custom acima de 500 chars", () => {
    expect(
      parseLeadPayload({ ...validBody, custom: { nota: "x".repeat(501) } }).ok
    ).toBe(false);
  });

  it("aceita campos de controle _hp/_ts/_turnstile", () => {
    const r = parseLeadPayload({ ...validBody, _hp: "", _ts: Date.now(), _turnstile: "tok" });
    expect(r.ok).toBe(true);
  });

  it("rejeita _ts não numérico", () => {
    expect(parseLeadPayload({ ...validBody, _ts: "agora" }).ok).toBe(false);
  });

  it("reporta os caminhos dos campos inválidos", () => {
    const r = parseLeadPayload({ name: "A", email: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.join(" ")).toContain("name");
      expect(r.issues.join(" ")).toContain("email");
    }
  });
});

describe("toLeadData / toTracking", () => {
  it("extrai dados persistíveis sem campos de controle", () => {
    const r = parseLeadPayload({ ...validBody, _hp: "", _ts: 123 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = toLeadData(r.data) as Record<string, unknown>;
    expect(data).toEqual({
      name: "Maria Silva",
      email: "maria@empresa.com.br",
      phone: "11987654321", // normalizado
      company: "Mercado Bom Preço",
      message: "Quero saber mais",
    });
    expect(data._hp).toBeUndefined();
    expect(data._ts).toBeUndefined();
  });

  it("omite tracking vazio e mantém só campos preenchidos", () => {
    const r1 = parseLeadPayload({ ...validBody, tracking: {} });
    if (r1.ok) expect(toTracking(r1.data)).toBeUndefined();

    const r2 = parseLeadPayload({
      ...validBody,
      tracking: { utmSource: "google", utmCampaign: "", pageUrl: "https://lp.com/x" },
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(toTracking(r2.data)).toEqual({ utmSource: "google", pageUrl: "https://lp.com/x" });
    }
  });
});
