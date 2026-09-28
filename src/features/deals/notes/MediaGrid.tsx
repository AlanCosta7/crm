/**
 * Mosaico de imagens e vídeos de uma nota.
 *
 * Um item ocupa a largura toda; dois ou mais viram grade de duas colunas. A
 * miniatura gerada no upload é o que carrega aqui — o arquivo cheio só é
 * baixado quando alguém abre o visualizador.
 */
import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { Lightbox } from './Lightbox';
import { formatDuration } from './mediaProcess';
import type { NoteAttachment } from '../../../types/crm';

interface MediaGridProps {
  items: NoteAttachment[];
  canDelete: boolean;
  onDelete: (attachment: NoteAttachment) => Promise<void>;
}

export function MediaGrid({ items, canDelete, onDelete }: MediaGridProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (items.length === 0) return null;

  const handleDelete = async (attachment: NoteAttachment) => {
    setDeleting(true);
    try {
      await onDelete(attachment);
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  };

  return (
    <>
      <div className={`media-grid ${items.length === 1 ? 'media-grid-single' : ''}`}>
        {items.map((item, i) => (
          <figure key={item.id} className="media-cell">
            <button
              type="button"
              className="media-open"
              onClick={() => setOpen(i)}
              aria-label={`Abrir ${item.name}`}
              style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
            >
              {item.thumbUrl || item.kind === 'image' ? (
                <img src={item.thumbUrl ?? item.url} alt={item.name} loading="lazy" />
              ) : (
                <span className="media-placeholder">
                  <Icon name="Video" size={22} color="var(--text-2)" />
                </span>
              )}

              {item.kind === 'video' && (
                <span className="media-play" aria-hidden="true">
                  <Icon name="Play" size={18} color="#fff" fill="#fff" />
                </span>
              )}

              {item.kind === 'video' && item.durationMs ? (
                <span className="media-duration">{formatDuration(item.durationMs)}</span>
              ) : null}
            </button>

            {canDelete && confirming !== item.id && (
              <button
                type="button"
                className="icon-btn media-del"
                aria-label={`Excluir ${item.name}`}
                onClick={() => setConfirming(item.id)}
              >
                <Icon name="Trash2" size={14} />
              </button>
            )}

            {canDelete && confirming === item.id && (
              <div className="media-confirm">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={deleting}
                  onClick={() => handleDelete(item)}
                >
                  {deleting ? '...' : 'Excluir'}
                </button>
              </div>
            )}
          </figure>
        ))}
      </div>

      {open !== null && <Lightbox items={items} startIndex={open} onClose={() => setOpen(null)} />}
    </>
  );
}
