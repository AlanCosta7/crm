import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  isValidKeyFormat,
} from "./apiKey";

describe("apiKey", () => {
  it("gera chave no formato wzk_ + 43 chars base64url", () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key).toMatch(/^wzk_[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prefix).toBe(`${key.slice(0, 12)}…`);
    expect(prefix).not.toContain(key.slice(12)); // prefixo não vaza a chave
  });

  it("gera chaves diferentes a cada chamada", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
    expect(keys.size).toBe(50);
  });

  it("hash é determinístico e corresponde ao SHA-256", () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
    expect(hashApiKey("wzk_outra")).not.toBe(hash);
  });

  describe("isValidKeyFormat", () => {
    it("aceita chave gerada", () => {
      expect(isValidKeyFormat(generateApiKey().key)).toBe(true);
    });

    it.each([
      [undefined, "ausente"],
      [null, "null"],
      [123, "número"],
      ["", "vazia"],
      ["wzk_curta", "curta demais"],
      [`${API_KEY_PREFIX}${"a".repeat(44)}`, "longa demais"],
      [`abc_${"a".repeat(43)}`, "prefixo errado"],
      [`wzk_${"a".repeat(42)}!`, "caractere inválido"],
    ])("rejeita %s (%s)", (value) => {
      expect(isValidKeyFormat(value)).toBe(false);
    });
  });

  describe("hashesMatch", () => {
    it("true para hashes iguais, false para diferentes", () => {
      const h1 = hashApiKey("wzk_a");
      const h2 = hashApiKey("wzk_b");
      expect(hashesMatch(h1, h1)).toBe(true);
      expect(hashesMatch(h1, h2)).toBe(false);
    });

    it("false para tamanhos diferentes (sem lançar)", () => {
      expect(hashesMatch("abcd", hashApiKey("wzk_a"))).toBe(false);
    });
  });
});
