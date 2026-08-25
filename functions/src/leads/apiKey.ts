/**
 * apiKey.ts — Geração e verificação de chaves de API das fontes de captação.
 *
 * Formato da chave: "wzk_" + 32 bytes aleatórios em base64url (43 chars).
 * A chave em claro NUNCA é armazenada — apenas o hash SHA-256 (hex) no doc
 * da fonte (`lead_sources.apiKeyHash`). A UI exibe a chave uma única vez.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "wzk_";

/** wzk_ + 43 chars base64url (32 bytes) */
const KEY_FORMAT = /^wzk_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  /** chave em claro — exibir uma única vez e descartar */
  key: string;
  /** SHA-256 hex — o que vai para o Firestore */
  hash: string;
  /** prefixo p/ identificação visual na UI (ex.: "wzk_ab12efgh…") */
  prefix: string;
}

export function generateApiKey(
  randomFn: (bytes: number) => Buffer = randomBytes
): GeneratedApiKey {
  const key = API_KEY_PREFIX + randomFn(32).toString("base64url");
  return {
    key,
    hash: hashApiKey(key),
    prefix: `${key.slice(0, 12)}…`,
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isValidKeyFormat(key: unknown): key is string {
  return typeof key === "string" && KEY_FORMAT.test(key);
}

/** Comparação de hashes em tempo constante (evita timing attack). */
export function hashesMatch(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
