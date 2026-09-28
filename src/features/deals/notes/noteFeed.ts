/**
 * Montagem da timeline de notas — funções puras, sem Firestore.
 *
 * A aba mistura duas origens:
 *  - `notes`: as notas novas (markdown, anexos, editáveis)
 *  - `activities` com `type: 'note'`: o formato antigo, e também as notas que o
 *    sistema grava sozinho (atribuição de SDR, standby). Entram só para leitura.
 */
import type { Activity, Note, NoteAttachment, UserRole } from '../../../types/crm';

export interface NoteFeedItem {
  id: string;
  /** `note` = editável; `legacy` = veio de activities, somente leitura */
  origin: 'note' | 'legacy';
  authorId: string;
  body: string;
  attachments: NoteAttachment[];
  createdAt: Date | null;
  editedAt: Date | null;
  /** Documento original — presente só quando origin === 'note' */
  note?: Note;
}

/** Aceita Timestamp do Firestore, Date, número ou string ISO. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = value as { toDate?: () => Date };
  const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(value as string | number | Date);
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

function fromNote(n: Note): NoteFeedItem {
  return {
    id: n.id ?? '',
    origin: 'note',
    authorId: n.authorId,
    body: n.body ?? '',
    attachments: n.attachments ?? [],
    createdAt: toDate(n.createdAt),
    editedAt: toDate(n.editedAt),
    note: n,
  };
}

function fromLegacy(a: Activity): NoteFeedItem {
  return {
    id: a.id ?? '',
    origin: 'legacy',
    authorId: a.userId,
    body: a.text ?? '',
    attachments: [],
    createdAt: toDate(a.createdAt),
    editedAt: null,
  };
}

/**
 * Junta as duas origens em uma lista ordenada da mais recente para a mais
 * antiga. Item sem data vai para o fim: um documento recém-criado, ainda sem o
 * timestamp resolvido, não deve furar a fila.
 *
 * Activities que carregam `noteId` são apenas o espelho de uma nota no feed
 * geral (Cloud Function da Fase 2) e ficam de fora — senão a mesma nota
 * apareceria duas vezes aqui.
 */
export function mergeNoteFeed(notes: Note[], legacy: Activity[]): NoteFeedItem[] {
  const items = [
    ...notes.filter(n => !!n.id).map(fromNote),
    ...legacy
      .filter(a => !(a as Activity & { noteId?: string }).noteId)
      .filter(a => (a.text ?? '').trim().length > 0)
      .map(fromLegacy),
  ];

  return items.sort((a, b) => {
    const ta = a.createdAt?.getTime() ?? -Infinity;
    const tb = b.createdAt?.getTime() ?? -Infinity;
    return tb - ta;
  });
}

/** Autor edita a própria nota; ninguém mais — nem o master (que só modera). */
export function canEditNote(item: NoteFeedItem, uid?: string): boolean {
  return item.origin === 'note' && !!uid && item.authorId === uid;
}

/**
 * Autor exclui a sua; master exclui qualquer uma (moderação — decisão do
 * cliente em 31/08/2026). Espelha a rule do Firestore.
 */
export function canDeleteNote(item: NoteFeedItem, uid?: string, role?: UserRole): boolean {
  if (item.origin !== 'note') return false;
  return (!!uid && item.authorId === uid) || role === 'master';
}
