/**
 * Chip de anexo dentro do composer — mostra o progresso do envio e deixa
 * cancelar/remover antes de salvar a nota.
 */
import { Icon } from '../../../components/ui/Icon';
import { documentIcon, formatBytes } from './attachments';
import type { PendingUpload } from './useAttachmentUpload';

interface AttachmentChipProps {
  upload: PendingUpload;
  onCancel: () => void;
  onRemove: () => void;
}

export function AttachmentChip({ upload, onCancel, onRemove }: AttachmentChipProps) {
  const failed = upload.status === 'error' || upload.status === 'canceled';
  const uploading = upload.status === 'uploading';

  return (
    <div className={`att-chip ${failed ? 'att-chip-error' : ''}`} title={upload.name}>
      <Icon
        name={failed ? 'TriangleAlert' : documentIcon(upload.name, upload.mime)}
        size={15}
        color={failed ? 'var(--danger)' : 'var(--text-2)'}
      />

      <div className="att-chip-info">
        <span className="att-chip-name">{upload.name}</span>
        <span className="muted att-chip-meta">
          {failed ? upload.error : uploading ? `${upload.progress}%` : formatBytes(upload.size)}
        </span>
        {uploading && (
          <div className="att-progress" role="progressbar" aria-valuenow={upload.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="att-progress-fill" style={{ width: `${upload.progress}%` }} />
          </div>
        )}
      </div>

      <button
        type="button"
        className="icon-btn att-chip-x"
        aria-label={uploading ? `Cancelar envio de ${upload.name}` : `Remover ${upload.name}`}
        onClick={uploading ? onCancel : onRemove}
      >
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}
