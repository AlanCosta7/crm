/**
 * Aba "Notas" do card.
 *
 * Substitui o textarea solto que existia no DealSidebar: agora as notas são
 * markdown, editáveis pelo autor e excluíveis pelo autor (ou pelo master, que
 * modera). As notas do formato antigo continuam na mesma timeline, só de
 * leitura.
 */
import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { useAuthStore } from '../../../stores/authStore';
import { useNotes } from './useNotes';
import { NoteComposer } from './NoteComposer';
import { NoteItem } from './NoteItem';
import { canEditNote, canDeleteNote } from './noteFeed';
import { useKeyboardInset } from './useKeyboardInset';
import { isTouchDevice } from './audioRecording';
import { toggleChecklistItem } from './markdownEdit';
import type { Activity, ProductId, Seller } from '../../../types/crm';

interface NotesTabProps {
  dealId: string;
  productId: ProductId;
  activities: Activity[];
  sellers: Seller[];
  /** Papel operacional: viewer e design leem, mas não escrevem */
  canWrite: boolean;
  onToast?: (message: string) => void;
}

const PAGE = 20;

export function NotesTab({ dealId, productId, activities, sellers, canWrite, onToast }: NotesTabProps) {
  const { user } = useAuthStore();
  const {
    feed, loading, newNoteId, createNote, updateNote, toggleChecklist, deleteNote, removeAttachment,
  } = useNotes({ dealId, productId, activities });
  const [visible, setVisible] = useState(PAGE);
  /**
   * Remonta o composer depois de salvar: ele decide o `noteId` na montagem
   * (os anexos sobem antes de a nota existir), então a próxima nota precisa de
   * uma instância nova para ganhar um id novo.
   */
  const [composerKey, setComposerKey] = useState(0);

  /**
   * No celular o composer vira uma faixa fixa acima do teclado enquanto está
   * em foco — caso contrário ele rola para fora da tela assim que o teclado
   * abre. No desktop nada muda.
   */
  const [touch] = useState(isTouchDevice);
  const [composing, setComposing] = useState(false);
  const anchored = touch && composing;
  useKeyboardInset(anchored);

  const shown = feed.slice(0, visible);

  return (
    <div className={`notes-tab ${anchored ? 'notes-tab-composing' : ''}`}>
      {anchored && (
        <div
          className="note-composer-backdrop"
          onClick={() => setComposing(false)}
          aria-hidden="true"
        />
      )}

      {canWrite && (
        <NoteComposer
          key={composerKey}
          draftKey={dealId}
          makeNoteId={newNoteId}
          sellers={sellers}
          currentUid={user?.uid}
          onFocusChange={setComposing}
          onSubmit={async (body, attachments, noteId) => {
            await createNote(noteId, { body, attachments });
            setComposerKey(k => k + 1);
            setComposing(false);
            onToast?.(
              attachments.length > 0
                ? `📎 Nota registrada com ${attachments.length} anexo${attachments.length > 1 ? 's' : ''}`
                : '📝 Nota registrada no card'
            );
          }}
        />
      )}

      {loading && feed.length === 0 ? (
        <div className="muted notes-empty">Carregando notas...</div>
      ) : feed.length === 0 ? (
        <div className="muted notes-empty">
          <Icon name="StickyNote" size={22} />
          <span>Nenhuma nota registrada neste lead ainda.</span>
        </div>
      ) : (
        <>
          {shown.map(item => (
            <NoteItem
              key={`${item.origin}-${item.id}`}
              item={item}
              sellers={sellers}
              currentUid={user?.uid}
              canEdit={canEditNote(item, user?.uid)}
              canDelete={canDeleteNote(item, user?.uid, user?.role)}
              onEdit={async (body, attachments) => {
                await updateNote(item, body, attachments);
                onToast?.('✏️ Nota atualizada');
              }}
              onDelete={async () => {
                await deleteNote(item);
                onToast?.('🗑️ Nota excluída');
              }}
              onToggleChecklist={async index => {
                await toggleChecklist(item, toggleChecklistItem(item.body, index));
              }}
              onRemoveAttachment={async attachment => {
                await removeAttachment(item, attachment);
                onToast?.('🗑️ Anexo removido');
              }}
            />
          ))}

          {feed.length > visible && (
            <button
              type="button"
              className="btn btn-outline btn-sm notes-more"
              onClick={() => setVisible(v => v + PAGE)}
            >
              Carregar mais ({feed.length - visible})
            </button>
          )}
        </>
      )}
    </div>
  );
}
