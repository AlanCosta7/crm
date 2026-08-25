/**
 * dedupe.ts — Chave de deduplicação de leads.
 *
 * Identidade do lead = email normalizado (prioridade) ou telefone BR
 * normalizado. Mesmo identidade + mesma fonte dentro de 24h = duplicado
 * (vira activity no deal existente em vez de deal novo).
 *
 * Limitação conhecida (registrada no plano): se o 1º envio tem email+telefone
 * e o 2º só telefone, a chave difere (a 1ª usou o email) e um deal novo é
 * criado. Aceitável no MVP.
 */

import { createHash } from "node:crypto";
import { normalizeEmail, normalizePhoneBR } from "./validation";

export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Chave determinística de dedupe: sha256("sourceId:identidade").
 * Retorna null se não houver email nem telefone válidos (não deve ocorrer
 * após a validação, que exige um dos dois).
 */
export function dedupeKeyFor(
  sourceId: string,
  email: string | undefined,
  phone: string | undefined
): string | null {
  const identity = normalizeEmail(email) ?? normalizePhoneBR(phone);
  if (!identity) return null;
  return createHash("sha256").update(`${sourceId}:${identity}`, "utf8").digest("hex");
}
