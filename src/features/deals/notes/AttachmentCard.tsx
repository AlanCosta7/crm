/**
 * Anexo já salvo, exibido na timeline da nota.
 *
 * Nesta fase todo anexo é documento (imagem, áudio e vídeo ganham suas
 * apresentações próprias nas fases 3 e 4). O link abre em nova aba; como o
 * objeto sobe com `Content-Disposition: attachment`, o navegador baixa em vez
 * de renderizar no domínio do bucket.
 */
import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { documentIcon, fileExtension, formatBytes } from './attachments';
import type { NoteAttachment } from '../../../types/crm';

interface AttachmentCardProps {
  attachment: NoteAttachment;
  /** Só o autor da nota (e o master, que modera) recebe a ação de excluir */
  canDelete: boolean;
  onDelete: () => Promise<void>;
}

export function AttachmentCard({ attachment, canDelete, onDelete }: AttachmentCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="att-card">
      <span className="att-card-icon" aria-hidden="true">
        <Icon name={documentIcon(attachment.name, attachment.mime)} size={17} color="var(--primary)" />
        <span className="att-card-ext">{fileExtension(attachment.name)}</span>
      </span>

      <a
        className="att-card-link"
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        title={attachment.name}
      >
        <span className="att-card-name">{attachment.name}</span>
        <span className="muted att-card-size">{formatBytes(attachment.size)}</span>
      </a>

      {canDelete && !confirming && (
        <button
          type="button"
          className="icon-btn att-card-x"
          aria-label={`Excluir ${attachment.name}`}
          onClick={() => setConfirming(true)}
        >
          <Icon name="Trash2" size={14} />
        </button>
      )}

      {canDelete && confirming && (
        <span className="att-card-confirm">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </span>
      )}
    </div>
  );
}
