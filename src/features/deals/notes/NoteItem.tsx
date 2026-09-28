/**
 * Uma nota na timeline: autor, quando, corpo em markdown e as ações do autor.
 *
 * Notas legadas (vindas de `activities`) chegam aqui com `origin: 'legacy'` —
 * renderizam igual, mas sem editar nem excluir.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { Av } from '../../../components/ui/Av';
import { MarkdownView } from './MarkdownView';
import { NoteComposer } from './NoteComposer';
import { AttachmentCard } from './AttachmentCard';
import { MediaGrid } from './MediaGrid';
import { AudioPlayer } from './AudioPlayer';
import type { NoteFeedItem } from './noteFeed';
import type { NoteAttachment, Seller } from '../../../types/crm';
import { sellerById } from '../../../utils/crmFormat';

interface NoteItemProps {
  item: NoteFeedItem;
  sellers: Seller[];
  currentUid?: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (body: string, attachments: NoteAttachment[]) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleChecklist: (index: number) => Promise<void>;
  onRemoveAttachment: (attachment: NoteAttachment) => Promise<void>;
}

function formatWhen(d: Date | null): string {
  if (!d) return 'agora';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 60 * 24) return `há ${Math.floor(diffMin / 60)} h`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function fullDate(d: Date | null): string {
  return d ? d.toLocaleString('pt-BR') : '';
}

export function NoteItem({
  item, sellers, currentUid, canEdit, canDelete,
  onEdit, onDelete, onToggleChecklist, onRemoveAttachment,
}: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const visuais = item.attachments.filter(a => a.kind === 'image' || a.kind === 'video');
  const audios = item.attachments.filter(a => a.kind === 'audio');
  const documentos = item.attachments.filter(a => a.kind === 'document');

  const seller = sellerById(sellers, item.authorId);
  const authorName = item.authorId === currentUid ? 'Você' : seller?.name ?? 'Time';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
      setMenuOpen(false);
    }
  };

  if (editing) {
    return (
      <div className="note-item note-item-editing">
        <NoteComposer
          mode="edit"
          noteId={item.id}
          initialBody={item.body}
          sellers={sellers}
          currentUid={currentUid}
          submitLabel="Salvar alterações"
          autoFocus
          onSubmit={async (body, novos) => {
            // Anexos existentes seguem gerenciados pelos cards abaixo da nota;
            // aqui só entram os que acabaram de subir.
            await onEdit(body, [...item.attachments, ...novos]);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <article className="note-item">
      <Av name={seller?.name ?? authorName} initials={seller?.initials} color={seller?.color} size={30} />

      <div className="note-body">
        <header className="note-meta">
          <span className="note-author">{authorName}</span>
          <span className="muted" title={fullDate(item.createdAt)}>· {formatWhen(item.createdAt)}</span>
          {item.editedAt && (
            <span className="muted note-edited" title={`Editada em ${fullDate(item.editedAt)}`}>· editada</span>
          )}
          {item.origin === 'legacy' && (
            <span className="muted note-legacy" title="Registrada no formato antigo — não pode ser editada">
              · registro antigo
            </span>
          )}

          {(canEdit || canDelete) && (
            <div className="note-actions" ref={menuRef}>
              <button
                type="button"
                className="icon-btn note-menu-btn"
                aria-label="Ações da nota"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => { setMenuOpen(o => !o); setConfirming(false); }}
              >
                <Icon name="MoreHorizontal" size={16} />
              </button>

              {menuOpen && (
                <div className="note-menu" role="menu">
                  {canEdit && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setEditing(true); setMenuOpen(false); }}
                    >
                      <Icon name="Pencil" size={14} /> Editar
                    </button>
                  )}
                  {canDelete && !confirming && (
                    <button type="button" role="menuitem" className="danger" onClick={() => setConfirming(true)}>
                      <Icon name="Trash2" size={14} /> Excluir
                    </button>
                  )}
                  {canDelete && confirming && (
                    <div className="note-confirm">
                      <span className="muted">Excluir esta nota?</span>
                      <div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={deleting}
                          onClick={handleDelete}
                        >
                          {deleting ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        {item.body && (
          <MarkdownView
            body={item.body}
            onToggleChecklist={canEdit ? index => { void onToggleChecklist(index); } : undefined}
          />
        )}

        {/* Cada tipo tem a sua apresentação: mídia visual em mosaico, áudio
            com player compacto, documento em card com download. */}
        <MediaGrid items={visuais} canDelete={canEdit} onDelete={onRemoveAttachment} />

        {audios.length > 0 && (
          <div className="att-list">
            {audios.map(a => (
              <AudioPlayer
                key={a.id}
                attachment={a}
                canDelete={canEdit}
                onDelete={() => onRemoveAttachment(a)}
              />
            ))}
          </div>
        )}

        {documentos.length > 0 && (
          <div className="att-list">
            {documentos.map(a => (
              <AttachmentCard
                key={a.id}
                attachment={a}
                canDelete={canEdit}
                onDelete={() => onRemoveAttachment(a)}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
