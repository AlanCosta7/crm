import { describe, expect, it } from "vitest";
import { dedupeKeyFor, DEDUPE_WINDOW_MS } from "./dedupe";

describe("dedupeKeyFor", () => {
  it("mesma identidade + mesma fonte = mesma chave", () => {
    const a = dedupeKeyFor("src1", "maria@empresa.com", undefined);
    const b = dedupeKeyFor("src1", "MARIA@empresa.com ", undefined);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fontes diferentes = chaves diferentes", () => {
    expect(dedupeKeyFor("src1", "a@b.com", undefined)).not.toBe(
      dedupeKeyFor("src2", "a@b.com", undefined)
    );
  });

  it("email tem prioridade sobre telefone", () => {
    const withBoth = dedupeKeyFor("src1", "a@b.com", "11987654321");
    expect(withBoth).toBe(dedupeKeyFor("src1", "a@b.com", undefined));
    expect(withBoth).not.toBe(dedupeKeyFor("src1", undefined, "11987654321"));
  });

  it("telefone é normalizado antes de gerar a chave", () => {
    expect(dedupeKeyFor("src1", undefined, "+55 (11) 98765-4321")).toBe(
      dedupeKeyFor("src1", undefined, "11987654321")
    );
  });

  it("null quando não há identidade válida", () => {
    expect(dedupeKeyFor("src1", undefined, undefined)).toBeNull();
    expect(dedupeKeyFor("src1", "sem-arroba", "123")).toBeNull();
  });

  it("janela de dedupe é 24h", () => {
    expect(DEDUPE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
