/**
 * leadSourceKey.ts — Geração client-side da chave de API de uma fonte de
 * captação (WizMart Forms).
 *
 * A chave é gerada no navegador do admin, exibida UMA única vez e somente o
 * hash SHA-256 vai para o Firestore (`lead_sources.apiKeyHash`) — o servidor
 * nunca conhece a chave em claro. Espelha o formato de
 * functions/src/leads/apiKey.ts: "wzk_" + 32 bytes em base64url (43 chars).
 */

export const LEADS_ENDPOINT = 'https://wizmart-crm.web.app/api/leads';

export interface GeneratedLeadSourceKey {
  /** chave em claro — exibir uma vez e descartar */
  key: string;
  /** SHA-256 hex p/ gravar no doc da fonte */
  hash: string;
  /** prefixo p/ identificação visual (ex.: "wzk_ab12efgh…") */
  prefix: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateLeadSourceKey(): Promise<GeneratedLeadSourceKey> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = `wzk_${toBase64Url(bytes)}`;
  return { key, hash: await sha256Hex(key), prefix: `${key.slice(0, 12)}…` };
}

/**
 * Normaliza uma entrada de domínio para uma origem (scheme://host[:port]),
 * descartando path/query/hash — tolera o usuário colar a URL completa de
 * uma página (ex.: "https://site.com/landing?utm=x") em vez de só o domínio.
 * Wildcards de subdomínio ("*.site.com") não são URLs válidas e ficam como estão.
 */
function normalizeOriginEntry(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\/+$/, '');
  if (!trimmed || trimmed.startsWith('*')) return trimmed;
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return trimmed;
  }
}

/**
 * Converte o texto do campo "domínios permitidos" (um por linha ou separados
 * por vírgula) em lista normalizada, sem vazios e sem duplicatas.
 */
export function parseOriginsInput(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const entry = normalizeOriginEntry(raw);
    if (!entry) continue;
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  return result;
}
