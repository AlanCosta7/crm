import { describe, expect, it, vi } from "vitest";
import {
  checkHoneypot,
  checkTimeTrap,
  extractOrigin,
  isOriginAllowed,
  isTimeTrapBlocked,
  MIN_SUBMIT_MS,
  MAX_RENDER_AGE_MS,
  normalizeOriginEntry,
  verifyTurnstile,
  type FetchLike,
} from "./antibot";

const NOW = 1_752_000_000_000;

describe("checkHoneypot", () => {
  it("ok quando vazio, ausente ou não-string", () => {
    expect(checkHoneypot(undefined)).toBe("ok");
    expect(checkHoneypot("")).toBe("ok");
    expect(checkHoneypot("   ")).toBe("ok");
    expect(checkHoneypot(null)).toBe("ok");
  });

  it("bot quando preenchido", () => {
    expect(checkHoneypot("http://spam.com")).toBe("bot");
    expect(checkHoneypot("a")).toBe("bot");
  });
});

describe("checkTimeTrap", () => {
  it("ok para submit humano (render 10s atrás)", () => {
    expect(checkTimeTrap(NOW - 10_000, NOW)).toBe("ok");
  });

  it("too_fast para submit instantâneo de bot", () => {
    expect(checkTimeTrap(NOW - 500, NOW)).toBe("too_fast");
    expect(checkTimeTrap(NOW - (MIN_SUBMIT_MS - 1), NOW)).toBe("too_fast");
  });

  it("ok exatamente no limiar de 3s", () => {
    expect(checkTimeTrap(NOW - MIN_SUBMIT_MS, NOW)).toBe("ok");
  });

  it("stale para render com mais de 24h (replay)", () => {
    expect(checkTimeTrap(NOW - MAX_RENDER_AGE_MS - 1, NOW)).toBe("stale");
  });

  it("future para timestamp no futuro além do skew", () => {
    expect(checkTimeTrap(NOW + 120_000, NOW)).toBe("future");
  });

  it("tolera relógio adiantado dentro do skew de 60s", () => {
    expect(checkTimeTrap(NOW + 30_000, NOW)).toBe("too_fast"); // elapsed negativo pequeno
  });

  it("future para valores não numéricos (payload forjado)", () => {
    expect(checkTimeTrap("1752000000000", NOW)).toBe("future");
    expect(checkTimeTrap(NaN, NOW)).toBe("future");
  });

  it("missing não bloqueia (integração server-side)", () => {
    expect(checkTimeTrap(undefined, NOW)).toBe("missing");
    expect(isTimeTrapBlocked("missing")).toBe(false);
    expect(isTimeTrapBlocked("ok")).toBe(false);
    expect(isTimeTrapBlocked("too_fast")).toBe(true);
    expect(isTimeTrapBlocked("stale")).toBe(true);
    expect(isTimeTrapBlocked("future")).toBe(true);
  });
});

describe("extractOrigin", () => {
  it("usa o header Origin quando presente", () => {
    expect(extractOrigin("https://Site.com.br/", undefined)).toBe("https://site.com.br");
  });

  it("cai para a origin do Referer quando Origin ausente", () => {
    expect(extractOrigin(undefined, "https://lp.site.com.br/pagina?x=1")).toBe(
      "https://lp.site.com.br"
    );
  });

  it("null quando nada presente ou Referer inválido", () => {
    expect(extractOrigin(undefined, undefined)).toBeNull();
    expect(extractOrigin(undefined, "not-a-url")).toBeNull();
    expect(extractOrigin("null", undefined)).toBeNull(); // sandbox/iframe manda "null" literal
  });
});

describe("isOriginAllowed", () => {
  const allowed = ["https://wizmart.com.br", "https://*.wizmart.com.br", "lp.parceiro.com"];

  it("aceita match exato", () => {
    expect(isOriginAllowed("https://wizmart.com.br", allowed)).toBe(true);
  });

  it("aceita entrada cadastrada sem esquema (assume https)", () => {
    expect(isOriginAllowed("https://lp.parceiro.com", allowed)).toBe(true);
  });

  it("aceita subdomínio via wildcard, mas não o apex pelo wildcard", () => {
    expect(isOriginAllowed("https://promo.wizmart.com.br", allowed)).toBe(true);
    expect(isOriginAllowed("https://a.b.wizmart.com.br", allowed)).toBe(true);
    expect(isOriginAllowed("https://promo.wizmart.com.br", ["https://*.outro.com"])).toBe(false);
  });

  it("rejeita domínio parecido (sufixo forjado)", () => {
    expect(isOriginAllowed("https://fakewizmart.com.br", allowed)).toBe(false);
    expect(isOriginAllowed("https://wizmart.com.br.evil.com", allowed)).toBe(false);
  });

  it("rejeita esquema http quando cadastrado https", () => {
    expect(isOriginAllowed("http://wizmart.com.br", allowed)).toBe(false);
    expect(isOriginAllowed("http://promo.wizmart.com.br", allowed)).toBe(false);
  });

  it("rejeita origin ausente, inválida ou lista vazia", () => {
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed("garbage", allowed)).toBe(false);
    expect(isOriginAllowed("https://wizmart.com.br", [])).toBe(false);
  });
});

describe("normalizeOriginEntry", () => {
  it("normaliza caixa, barra final e esquema ausente", () => {
    expect(normalizeOriginEntry("  HTTPS://Site.com/ ")).toBe("https://site.com");
    expect(normalizeOriginEntry("site.com")).toBe("https://site.com");
    expect(normalizeOriginEntry("*.site.com")).toBe("*.site.com");
  });

  it("descarta path/query/hash quando o admin cola a URL completa da página", () => {
    expect(normalizeOriginEntry("https://crm-codifyx.web.app/teste-captacao-leads.html")).toBe(
      "https://crm-codifyx.web.app"
    );
    expect(normalizeOriginEntry("site.com/landing?utm_source=google#topo")).toBe("https://site.com");
  });

  it("preserva a porta quando presente", () => {
    expect(normalizeOriginEntry("http://localhost:5173/qualquer/coisa")).toBe("http://localhost:5173");
  });
});

describe("verifyTurnstile", () => {
  const okFetch: FetchLike = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true }),
  }));

  it("true quando a Cloudflare confirma", async () => {
    expect(await verifyTurnstile("token", "secret", "1.2.3.4", okFetch)).toBe(true);
  });

  it("false sem token ou sem secret (fail-closed)", async () => {
    expect(await verifyTurnstile(undefined, "secret", "1.2.3.4", okFetch)).toBe(false);
    expect(await verifyTurnstile("", "secret", "1.2.3.4", okFetch)).toBe(false);
    expect(await verifyTurnstile("token", "", "1.2.3.4", okFetch)).toBe(false);
  });

  it("false quando a Cloudflare nega ou a rede falha (fail-closed)", async () => {
    const denyFetch: FetchLike = async () => ({ ok: true, json: async () => ({ success: false }) });
    const errorFetch: FetchLike = async () => {
      throw new Error("network");
    };
    const badStatusFetch: FetchLike = async () => ({ ok: false, json: async () => ({}) });
    expect(await verifyTurnstile("token", "secret", "1.2.3.4", denyFetch)).toBe(false);
    expect(await verifyTurnstile("token", "secret", "1.2.3.4", errorFetch)).toBe(false);
    expect(await verifyTurnstile("token", "secret", "1.2.3.4", badStatusFetch)).toBe(false);
  });
});
