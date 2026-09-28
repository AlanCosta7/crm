/**
 * ProjectFilePicker.tsx — seletor de anexos com progresso (solicitação e entrega).
 * O estado vive no `useProjectUpload` do pai, para ele saber quando há envio em
 * andamento e bloquear o "Enviar".
 */
import { useRef } from 'react';
import { Icon } from '../../components/ui/Icon';
import { formatBytes } from '../deals/notes/attachments';
import type { ProjectUpload } from './useProjectUpload';

interface Props {
  uploads: ProjectUpload[];
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
  accept: string;
  label: string;
  hint: string;
  maxFiles?: number;
}

export function ProjectFilePicker({ uploads, onAdd, onRemove, accept, label, hint, maxFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const full = maxFiles !== undefined && uploads.length >= maxFiles;

  return (
    <div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={accept}
        data-testid="project-file-input"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={full}
        onClick={() => input.current?.click()}
        style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', padding: '14px 10px' }}
      >
        <Icon name="Upload" size={16} /> {label}
      </button>
      <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>{hint}</p>

      {uploads.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {uploads.map((u) => (
            <li
              key={u.id}
              data-testid="project-upload-item"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${u.status === 'error' ? '#FCA5A5' : 'var(--border)'}`, background: u.status === 'error' ? '#FEF2F2' : 'var(--card)' }}
            >
              <Icon
                name={u.status === 'done' ? 'CheckCircle2' : u.status === 'error' || u.status === 'canceled' ? 'AlertCircle' : 'Loader2'}
                size={15}
                color={u.status === 'done' ? '#15803D' : u.status === 'uploading' ? 'var(--text-2)' : '#B91C1C'}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {u.status === 'uploading' && `${u.progress}% · ${formatBytes(u.size)}`}
                  {u.status === 'done' && formatBytes(u.size)}
                  {(u.status === 'error' || u.status === 'canceled') && (u.error ?? 'Falhou')}
                </div>
                {u.status === 'uploading' && (
                  <div style={{ height: 3, borderRadius: 3, background: 'var(--bg-2)', marginTop: 4 }}>
                    <div style={{ width: `${u.progress}%`, height: '100%', background: '#1A6B1A', borderRadius: 3 }} />
                  </div>
                )}
              </div>
              <button type="button" className="icon-btn" aria-label={`Remover ${u.name}`} onClick={() => onRemove(u.id)} style={{ width: 24, height: 24 }}>
                <Icon name="X" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
