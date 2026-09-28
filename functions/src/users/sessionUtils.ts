/**
 * sessionUtils.ts — extração de IP e resumo de User-Agent (Fase 6.1)
 *
 * Puro, sem I/O — o IP real só pode ser capturado no servidor (o navegador não
 * sabe o próprio IP público), daí `logSessionEvent.ts` chamar isto sobre o
 * request cru da callable. Mesma lógica de `captureLead.ts`'s `clientIp`,
 * adaptada para o formato de headers de uma `onCall` (objeto simples, não o
 * `Request` do Express).
 */

export function clientIpFromHeaders(headers: Record<string, unknown>, fallbackIp?: string): string {
  const fwd = headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : undefined;
  return (first || fallbackIp || "unknown").slice(0, 64);
}

/**
 * Resume um User-Agent em algo legível na tabela de auditoria — ninguém
 * precisa ler a string inteira do UA para saber "Chrome no Mac" vs "Safari no
 * iPhone". Cobertura deliberadamente simples: os poucos navegadores/SOs que o
 * time realmente usa, com fallback honesto em vez de adivinhar.
 */
export function summarizeUserAgent(ua: string | undefined): string {
  if (!ua) return "Desconhecido";

  let browser = "Navegador desconhecido";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let so = "SO desconhecido";
  if (/iPhone|iPad/.test(ua)) so = "iOS";
  else if (/Android/.test(ua)) so = "Android";
  else if (/Mac OS X/.test(ua)) so = "macOS";
  else if (/Windows/.test(ua)) so = "Windows";
  else if (/Linux/.test(ua)) so = "Linux";

  return `${browser} · ${so}`;
}
