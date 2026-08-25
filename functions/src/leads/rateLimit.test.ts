import { describe, expect, it } from "vitest";
import {
  applyRateLimit,
  IP_LIMIT,
  rateLimitDocId,
  SOURCE_LIMIT,
  type RateLimitDoc,
} from "./rateLimit";

const WINDOW = 60_000;
const LIMIT = 5;
// alinhado ao início de uma janela p/ os cenários serem determinísticos
const T0 = Math.floor(1_752_000_000_000 / WINDOW) * WINDOW;

function run(doc: RateLimitDoc | null, now: number) {
  return applyRateLimit(doc, LIMIT, WINDOW, now);
}

describe("applyRateLimit", () => {
  it("permite a 1ª requisição (sem doc)", () => {
    const r = run(null, T0);
    expect(r.allowed).toBe(true);
    expect(r.nextDoc).toEqual({
      windowStart: T0,
      countCurrent: 1,
      countPrevious: 0,
      expiresAt: T0 + 2 * WINDOW,
    });
  });

  it("permite até o limite e bloqueia a partir dele", () => {
    let doc: RateLimitDoc | null = null;
    for (let i = 0; i < LIMIT; i++) {
      const r = run(doc, T0 + i * 1000);
      expect(r.allowed).toBe(true);
      doc = r.nextDoc;
    }
    const blocked = run(doc, T0 + LIMIT * 1000);
    expect(blocked.allowed).toBe(false);
  });

  it("requisições bloqueadas continuam contando (flood não destrava)", () => {
    let doc: RateLimitDoc | null = null;
    for (let i = 0; i < LIMIT + 10; i++) {
      doc = run(doc, T0 + i * 100).nextDoc;
    }
    expect(doc!.countCurrent).toBe(LIMIT + 10);
    expect(run(doc, T0 + 5000).allowed).toBe(false);
  });

  it("janela deslizante: pondera a janela anterior", () => {
    // 5 requisições na janela anterior
    let doc: RateLimitDoc | null = null;
    for (let i = 0; i < LIMIT; i++) doc = run(doc, T0 + i).nextDoc;

    // 10% da janela nova: estimativa ≈ 0 + 5*0.9 = 4.5 < 5 → permite
    const early = run(doc, T0 + WINDOW + 0.1 * WINDOW);
    expect(early.allowed).toBe(true);

    // com mais 1 na atual (total est. 1 + 5*0.9 = 5.5) → bloqueia
    const after = run(early.nextDoc, T0 + WINDOW + 0.1 * WINDOW + 1000);
    expect(after.allowed).toBe(false);

    // 90% da janela nova: estimativa 1 + 5*0.1 = 1.5 → permite de novo
    const late = run(early.nextDoc, T0 + WINDOW + 0.9 * WINDOW);
    expect(late.allowed).toBe(true);
  });

  it("doc com mais de 2 janelas é descartado (recomeça do zero)", () => {
    const old: RateLimitDoc = {
      windowStart: T0,
      countCurrent: 99,
      countPrevious: 99,
      expiresAt: T0 + 2 * WINDOW,
    };
    const r = run(old, T0 + 3 * WINDOW);
    expect(r.allowed).toBe(true);
    expect(r.nextDoc.countPrevious).toBe(0);
    expect(r.nextDoc.countCurrent).toBe(1);
  });

  it("constantes do plano: 5/min por IP e 60/h por fonte", () => {
    expect(IP_LIMIT).toEqual({ limit: 5, windowMs: 60_000 });
    expect(SOURCE_LIMIT).toEqual({ limit: 60, windowMs: 3_600_000 });
  });
});

describe("rateLimitDocId", () => {
  it("gera IDs previsíveis e sanitizados", () => {
    expect(rateLimitDocId("ip", "187.10.2.30")).toBe("ip_187.10.2.30");
    expect(rateLimitDocId("ip", "2804:14c::1a2b")).toBe("ip_2804_14c__1a2b");
    expect(rateLimitDocId("source", "lp-smart/café")).toBe("source_lp-smart_caf_");
  });
});
