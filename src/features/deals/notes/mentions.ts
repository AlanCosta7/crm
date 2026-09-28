/**
 * Menções `@pessoa` nas notas.
 *
 * No corpo, a menção é um link markdown com esquema próprio:
 *
 *     Falei com o cliente, [@Carla Rep](wm:user/rep-001) assume daqui.
 *
 * Guardar o `uid` no href (em vez de só o nome) faz a menção sobreviver a
 * troca de nome, e o texto continua legível para quem lê o markdown cru.
 *
 * O protocolo `wm:` é liberado no schema de sanitização, mas NUNCA vira um
 * `href` no DOM: o renderizador transforma a menção num `<span>`. Assim não
 * existe caminho para um protocolo desconhecido escapar para o navegador.
 */
import type { Seller } from '../../../types/crm';
import type { EditResult } from './markdownEdit';

export const MENTION_PREFIX = 'wm:user/';

/** Caracteres que quebrariam o link markdown se viessem no nome. */
function sanitizeLabel(name: string): string {
  return (name || 'pessoa').replace(/[[\]()]/g, '').replace(/\s+/g, ' ').trim() || 'pessoa';
}

/** `[@Carla Rep](wm:user/rep-001)` */
export function serializeMention(name: string, uid: string): string {
  return `[@${sanitizeLabel(name)}](${MENTION_PREFIX}${uid})`;
}

/** Extrai o uid de um href de menção; `null` se não for menção. */
export function parseMentionHref(href?: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed.startsWith(MENTION_PREFIX)) return null;
  const uid = trimmed.slice(MENTION_PREFIX.length).trim();
  return uid || null;
}

/**
 * Lista os uids mencionados no corpo, sem repetição e na ordem em que
 * aparecem. É o que vai desnormalizado em `note.mentions`, para a Cloud
 * Function não ter que reparsear markdown.
 */
export function extractMentions(body: string): string[] {
  const re = /\[@[^\]]*\]\(wm:user\/([^)\s]+)\)/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(body || '')) !== null) {
    const uid = match[1].trim();
    if (uid && !found.includes(uid)) found.push(uid);
  }
  return found;
}

export interface MentionQuery {
  /** Posição do `@` no texto */
  start: number;
  /** O que foi digitado depois do `@` */
  query: string;
}

/** Limite do que aceitamos como busca — nome de gente não passa disso. */
const MAX_QUERY = 30;

/**
 * Detecta se o cursor está logo depois de um `@` que inicia uma menção.
 *
 * O `@` só conta no início do texto ou depois de espaço/quebra/parêntese —
 * assim `contato@empresa.com.br` não abre o autocomplete no meio de um e-mail.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const upToCaret = (text || '').slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;

  const before = at === 0 ? '' : upToCaret[at - 1];
  if (before && !/[\s(]/.test(before)) return null;

  const query = upToCaret.slice(at + 1);
  if (query.length > MAX_QUERY) return null;
  // Quebra de linha, outro @ ou fechamento de link encerram a busca
  if (/[\n\r@[\]()]/.test(query)) return null;

  return { start: at, query };
}

/**
 * Troca o `@busca` em andamento pela menção completa e devolve o cursor logo
 * depois dela, com um espaço para continuar escrevendo.
 */
export function insertMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  name: string,
  uid: string
): EditResult {
  const snippet = `${serializeMention(name, uid)} `;
  const next = text.slice(0, mention.start) + snippet + text.slice(caret);
  const cursor = mention.start + snippet.length;
  return { text: next, start: cursor, end: cursor };
}

/** Normaliza para comparar sem acento e sem diferença de caixa. */
function fold(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export interface MentionCandidate {
  uid: string;
  name: string;
  initials?: string;
  color?: string;
}

/**
 * Filtra quem pode ser mencionado. Busca por qualquer palavra do nome ("rep"
 * acha "Carla Rep"), tira quem já foi mencionado no corpo e nunca sugere o
 * próprio autor.
 */
export function filterMentionCandidates(
  sellers: Seller[],
  query: string,
  options: { excludeUid?: string; alreadyMentioned?: string[]; limit?: number } = {}
): MentionCandidate[] {
  const { excludeUid, alreadyMentioned = [], limit = 6 } = options;
  const q = fold(query);

  return sellers
    .filter(s => s.id !== excludeUid && !alreadyMentioned.includes(s.id))
    .filter(s => {
      if (!q) return true;
      const name = fold(s.name);
      return name.startsWith(q) || name.split(' ').some(part => part.startsWith(q));
    })
    .slice(0, limit)
    .map(s => ({ uid: s.id, name: s.name, initials: s.initials, color: s.color }));
}

/**
 * Quem passou a ser mencionado entre uma versão e outra da nota. É o que
 * decide a notificação: reeditar o texto não pode avisar de novo quem já foi
 * avisado.
 */
export function newMentions(previous: string[] = [], current: string[] = []): string[] {
  return current.filter(uid => !previous.includes(uid));
}
