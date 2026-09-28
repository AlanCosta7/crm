import { describe, it, expect } from "vitest";
import { clientIpFromHeaders, summarizeUserAgent } from "./sessionUtils";

describe("clientIpFromHeaders", () => {
  it("usa o primeiro IP de x-forwarded-for", () => {
    expect(clientIpFromHeaders({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })).toBe("203.0.113.5");
  });

  it("aceita x-forwarded-for como array", () => {
    expect(clientIpFromHeaders({ "x-forwarded-for": ["203.0.113.5"] })).toBe("203.0.113.5");
  });

  it("cai no fallback quando o header não existe", () => {
    expect(clientIpFromHeaders({}, "198.51.100.1")).toBe("198.51.100.1");
  });

  it("sem header e sem fallback, devolve 'unknown'", () => {
    expect(clientIpFromHeaders({})).toBe("unknown");
  });

  it("trunca IPs absurdamente longos (defesa contra header forjado)", () => {
    const longo = "1".repeat(200);
    expect(clientIpFromHeaders({ "x-forwarded-for": longo }).length).toBe(64);
  });
});

describe("summarizeUserAgent", () => {
  it("identifica Chrome no macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(summarizeUserAgent(ua)).toBe("Chrome · macOS");
  });

  it("identifica Safari no iPhone", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(summarizeUserAgent(ua)).toBe("Safari · iOS");
  });

  it("identifica Edge no Windows (Edge também bate no regex de Chrome — checa Edge primeiro)", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(summarizeUserAgent(ua)).toBe("Edge · Windows");
  });

  it("identifica Firefox no Linux", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(summarizeUserAgent(ua)).toBe("Firefox · Linux");
  });

  it("identifica Chrome no Android", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    expect(summarizeUserAgent(ua)).toBe("Chrome · Android");
  });

  it("sem UA nenhum, devolve 'Desconhecido' em vez de string vazia", () => {
    expect(summarizeUserAgent(undefined)).toBe("Desconhecido");
    expect(summarizeUserAgent("")).toBe("Desconhecido");
  });

  it("UA não reconhecido não quebra — devolve os dois 'desconhecido'", () => {
    expect(summarizeUserAgent("CustomBot/1.0")).toBe("Navegador desconhecido · SO desconhecido");
  });
});
