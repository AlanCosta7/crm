/**
 * rateLimit.ts — Rate limit por janela deslizante (aproximação de 2 janelas).
 *
 * A função `applyRateLimit` é PURA (doc atual + relógio → decisão + próximo
 * doc); a persistência (transação no Firestore em `rate_limits/{id}`) fica
 * no captureLead. A estimativa pondera a janela anterior pela fração ainda
 * coberta — precisão suficiente sem guardar timestamp por requisição.
 *
 * Requisições bloqueadas TAMBÉM contam: flood contínuo permanece bloqueado
 * até o atacante parar de enviar.
 */

export interface RateLimitDoc {
  /** início da janela corrente (epoch ms, alinhado a windowMs) */
  windowStart: number;
  countCurrent: number;
  countPrevious: number;
  /** p/ política TTL do Firestore limpar docs antigos */
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  nextDoc: RateLimitDoc;
}

/** 5 requisições por minuto por IP */
export const IP_LIMIT = { limit: 5, windowMs: 60_000 } as const;
/** 60 requisições por hora por fonte */
export const SOURCE_LIMIT = { limit: 60, windowMs: 3_600_000 } as const;

export function applyRateLimit(
  doc: RateLimitDoc | null,
  limit: number,
  windowMs: number,
  nowMs: number
): RateLimitResult {
  const currentWindow = Math.floor(nowMs / windowMs) * windowMs;

  let countCurrent = 0;
  let countPrevious = 0;

  if (doc) {
    if (doc.windowStart === currentWindow) {
      countCurrent = doc.countCurrent;
      countPrevious = doc.countPrevious;
    } else if (doc.windowStart === currentWindow - windowMs) {
      countPrevious = doc.countCurrent;
    }
    // doc mais antigo que 2 janelas: descarta (começa do zero)
  }

  // fração da janela anterior ainda "coberta" pela janela deslizante
  const elapsedFraction = (nowMs - currentWindow) / windowMs;
  const estimate = countCurrent + countPrevious * (1 - elapsedFraction);

  const allowed = estimate < limit;

  return {
    allowed,
    nextDoc: {
      windowStart: currentWindow,
      countCurrent: countCurrent + 1,
      countPrevious,
      expiresAt: currentWindow + 2 * windowMs,
    },
  };
}

/**
 * ID do doc em `rate_limits`. Sanitiza p/ caracteres válidos de doc ID
 * (IPv6 tem ':', que é permitido, mas normalizamos por segurança).
 */
export function rateLimitDocId(scope: "ip" | "source", id: string): string {
  return `${scope}_${id.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}
