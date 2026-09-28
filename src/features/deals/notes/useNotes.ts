/**
 * Dados da aba Notas de um card.
 *
 * Assina `tenants/{tid}/notes` filtrando por `dealId` e mistura as notas
 * legadas (`activities` com `type: 'note'`), que o card já tem em mãos — sem
 * segunda assinatura.
 *
 * A query usa só `where`, sem `orderBy`: assim depende apenas do índice de
 * campo único que o Firestore cria sozinho, e a aba não quebra caso os índices
 * compostos ainda não tenham sido deployados. A ordenação é no client, onde o
 * volume por card é pequeno.
 */
import { useMemo, useCallback } from 'react';
import { where, collection, doc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useFirestoreCollection, useFirestoreMutations } from '../../../hooks/useFirestore';
import { useAuthStore } from '../../../stores/authStore';
import type { Activity, Note, NoteAttachment, ProductId } from '../../../types/crm';
import { deleteAttachmentObject } from './useAttachmentUpload';
import { mergeNoteFeed, type NoteFeedItem } from './noteFeed';
import { extractMentions } from './mentions';

interface UseNotesOptions {
  dealId: string;
  productId: ProductId;
  /** Activities já assinadas pelo card — filtradas aqui por deal e tipo */
  activities: Activity[];
}

export interface CreateNoteInput {
  body: string;
  attachments?: NoteAttachment[];
  mentions?: string[];
}

export function useNotes({ dealId, productId, activities }: UseNotesOptions) {
  const { user } = useAuthStore();
  // Desestruturado: dependência com optional chaining impede o React Compiler
  // de preservar a memoização destes callbacks.
  const uid = user?.uid;
  const tenantId = user?.tenantId;
  const { data: notes, loading } = useFirestoreCollection<Note>(
    'notes',
    [where('dealId', '==', dealId)],
    dealId
  );
  const { setDocument, updateDocument, deleteDocument } = useFirestoreMutations('notes');

  const legacy = useMemo(
    () => activities.filter(a => a.dealId === dealId && a.type === 'note'),
    [activities, dealId]
  );

  const feed: NoteFeedItem[] = useMemo(() => mergeNoteFeed(notes, legacy), [notes, legacy]);

  /**
   * Gera o id da nota ANTES de gravar. Os anexos da Fase 2 precisam do id para
   * subir direto em `tenants/{tid}/notes/{noteId}/…`, sem pasta temporária.
   */
  const newNoteId = useCallback(() => {
    if (!tenantId) throw new Error('Usuário sem tenant.');
    return doc(collection(db, 'tenants', tenantId, 'notes')).id;
  }, [tenantId]);

  const createNote = useCallback(
    async (noteId: string, input: CreateNoteInput) => {
      if (!uid || !tenantId) throw new Error('Usuário não autenticado.');
      const note: Note = {
        tenantId,
        entityType: 'deal',
        entityId: dealId,
        dealId,
        productId,
        authorId: uid,
        body: input.body,
        attachments: input.attachments ?? [],
        // Desnormalizado a partir do corpo: a Cloud Function que notifica não
        // precisa reparsear markdown para saber quem foi mencionado.
        mentions: input.mentions ?? extractMentions(input.body),
        createdAt: new Date(),
      };
      // setDocument (e não addDocument) porque o id já foi decidido acima
      await setDocument(noteId, note as unknown as Record<string, unknown>);
    },
    [uid, tenantId, dealId, productId, setDocument]
  );

  /**
   * Atualiza o corpo. `editedAt`/`editCount` alimentam o selo "editada" —
   * `authorId` e `createdAt` nunca vão no payload: as rules recusariam.
   */
  const updateNote = useCallback(
    async (item: NoteFeedItem, body: string, attachments?: NoteAttachment[]) => {
      await updateDocument(item.id, {
        body,
        mentions: extractMentions(body),
        editedAt: new Date(),
        editCount: (item.note?.editCount ?? 0) + 1,
        ...(attachments ? { attachments } : {}),
      });
    },
    [updateDocument]
  );

  /**
   * Tira um anexo da nota: primeiro o objeto no Storage, depois o metadado.
   * Nessa ordem porque um metadado apontando para objeto inexistente quebraria
   * a exibição; um objeto sem metadado é só lixo, que o janitor recolhe.
   */
  const removeAttachment = useCallback(
    async (item: NoteFeedItem, attachment: NoteAttachment) => {
      try {
        await deleteAttachmentObject(attachment);
      } catch (err) {
        console.warn('[useNotes] objeto já ausente no Storage:', err);
      }
      await updateDocument(item.id, {
        attachments: item.attachments.filter(a => a.id !== attachment.id),
      });
    },
    [updateDocument]
  );

  /** Alterna uma checkbox sem contar como edição do texto. */
  const toggleChecklist = useCallback(
    async (item: NoteFeedItem, body: string) => {
      await updateDocument(item.id, { body });
    },
    [updateDocument]
  );

  /**
   * Exclui a nota. Os anexos são apagados aqui pelo próprio autor (que tem
   * permissão nas rules); a Cloud Function `onNoteDeleted` varre o prefixo
   * depois, cobrindo o que ficou para trás — exclusão pelo master, falha de
   * rede no meio, exclusão pelo console.
   */
  const deleteNote = useCallback(
    async (item: NoteFeedItem) => {
      await Promise.all(
        item.attachments.map(a =>
          deleteAttachmentObject(a).catch(err =>
            console.warn('[useNotes] anexo não apagado no client:', err)
          )
        )
      );
      await deleteDocument(item.id);
    },
    [deleteDocument]
  );

  return { feed, loading, newNoteId, createNote, updateNote, toggleChecklist, deleteNote, removeAttachment };
}
