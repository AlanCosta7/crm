/**
 * antibot.ts — Camadas anti-bot: honeypot, time-trap, origin allowlist e
 * verificação Cloudflare Turnstile.
 *
 * Política de resposta (ver PLANO_CAPTACAO_LEADS.md §3): bloqueios anti-bot
 * respondem com SUCESSO FALSO (o bot não aprende qual camada barrou);
 * origin não permitido responde 403 explícito (é erro de configuração do
 * cliente, precisa ser depurável).
 */

/** Submit em menos de 3s do render do form = bot. */
export const MIN_SUBMIT_MS = 3000;
/** Render com mais de 24h = replay/stale. */
export const MAX_RENDER_AGE_MS = 24 * 60 * 60 * 1000;
/** Tolerância p/ relógio adiantado do navegador. */
const CLOCK_SKEW_MS = 60 * 1000;

// ── Honeypot ──────────────────────────────────────────────────────────────────

/** Campo oculto `_hp`: humano não vê e não preenche; bot preenche. */
export function checkHoneypot(value: unknown): "ok" | "bot" {
  if (typeof value === "string" && value.trim().length > 0) return "bot";
  return "ok";
}

// ── Time-trap ─────────────────────────────────────────────────────────────────

export type TimeTrapResult = "ok" | "too_fast" | "stale" | "future" | "missing";

/**
 * `_ts` = epoch ms de quando o form foi renderizado (injetado pelo snippet).
 * "missing" NÃO bloqueia (decisão registrada: integrações server-side podem
 * não ter o timestamp; bots ingênuos caem no honeypot).
 */
export function checkTimeTrap(renderTs: unknown, nowMs: number): TimeTrapResult {
  if (renderTs === undefined || renderTs === null) return "missing";
  if (typeof renderTs !== "number" || !Number.isFinite(renderTs)) return "future";
  const elapsed = nowMs - renderTs;
  if (elapsed < -CLOCK_SKEW_MS) return "future";
  if (elapsed < MIN_SUBMIT_MS) return "too_fast";
  if (elapsed > MAX_RENDER_AGE_MS) return "stale";
  return "ok";
}

/** true = deve ser tratado como bot (com sucesso falso). */
export function isTimeTrapBlocked(result: TimeTrapResult): boolean {
  return result === "too_fast" || result === "stale" || result === "future";
}

// ── Origin allowlist ──────────────────────────────────────────────────────────

/**
 * Normaliza uma origin/entrada da allowlist: minúsculas, sem barra final,
 * assume https:// quando o esquema for omitido no cadastro. Tolera o admin
 * ter cadastrado a URL completa de uma página (com path/query) em vez de só
 * o domínio — extrai a origem (scheme://host[:port]) e descarta o resto.
 * Wildcards de subdomínio ("*.dominio.com") não são URLs válidas e ficam como estão.
 */
export function normalizeOriginEntry(entry: string): string {
  const trimmed = entry.trim().toLowerCase().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("*")) return trimmed;
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return trimmed;
  }
}

/**
 * Extrai a origin efetiva da requisição: header Origin ou, na ausência,
 * a origin do Referer. Retorna null se nenhum estiver presente.
 */
export function extractOrigin(
  originHeader: string | undefined,
  refererHeader: string | undefined
): string | null {
  if (originHeader && originHeader !== "null") {
    return originHeader.trim().toLowerCase().replace(/\/+$/, "");
  }
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Verifica a origin contra a allowlist da fonte.
 * Suporta wildcard de subdomínio: "https://*.dominio.com.br" casa
 * "https://lp.dominio.com.br" (qualquer nível), mas NÃO o apex.
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const normalized = parsed.origin.toLowerCase();

  for (const rawEntry of allowedOrigins) {
    const entry = normalizeOriginEntry(rawEntry);
    if (!entry) continue;

    // wildcard de subdomínio: "https://*.dominio.com" ou "*.dominio.com"
    const wildcardMatch = entry.match(/^(https?:\/\/)?\*\.(.+)$/);
    if (wildcardMatch) {
      const scheme = wildcardMatch[1] ?? "https://";
      const baseHost = wildcardMatch[2];
      if (
        `${parsed.protocol}//` === scheme &&
        parsed.host.endsWith(`.${baseHost}`)
      ) {
        return true;
      }
      continue;
    }

    if (normalized === entry) return true;
  }
  return false;
}

// ── Cloudflare Turnstile ──────────────────────────────────────────────────────

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Valida o token do widget Turnstile no servidor da Cloudflare.
 * Fail-closed: qualquer erro de rede/resposta inválida = não verificado.
 */
export async function verifyTurnstile(
  token: unknown,
  secret: string,
  remoteIp: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || !secret) return false;
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }).toString(),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}
