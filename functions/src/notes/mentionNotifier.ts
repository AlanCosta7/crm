/**
 * Regras da notificação de menção — puras, para poderem ser testadas sem
 * emulador. O disparo em si está em `onNoteWritten`.
 */

/** Trecho da nota que vai no corpo da notificação. */
export const MENTION_PREVIEW_LIMIT = 120;

export interface MentionRecipientsInput {
  /** Mencionados na versão anterior da nota (vazio quando é nota nova) */
  previous?: string[];
  /** Mencionados agora */
  current?: string[];
  /** Autor da nota — nunca notifica a si mesmo */
  authorId: string;
  /** uids que existem e estão ativos no tenant */
  activeUids: string[];
}

/**
 * Quem deve ser notificado.
 *
 * Só quem passou a ser mencionado agora: reeditar a nota não pode avisar de
 * novo quem já foi avisado. O autor sai da lista, assim como uid que não
 * corresponde a ninguém ativo (usuário desligado, uid digitado à mão).
 */
export function resolveMentionRecipients({
  previous = [],
  current = [],
  authorId,
  activeUids,
}: MentionRecipientsInput): string[] {
  const active = new Set(activeUids);
  const before = new Set(previous);

  return current.filter(
    (uid, i) =>
      current.indexOf(uid) === i && // sem repetição
      !before.has(uid) &&
      uid !== authorId &&
      active.has(uid)
  );
}

/** Corpo da notificação: quem mencionou, onde, e um trecho da nota. */
export function buildMentionBody(
  authorName: string,
  dealName: string,
  plainText: string,
  limit = MENTION_PREVIEW_LIMIT
): string {
  const trecho = plainText.length > limit ? `${plainText.slice(0, limit).trimEnd()}...` : plainText;
  const onde = dealName ? ` em ${dealName}` : '';
  return trecho ? `${authorName}${onde}: ${trecho}` : `${authorName} mencionou você${onde}.`;
}
