/**
 * Player de áudio compacto para os anexos de voz da nota.
 *
 * Usa o elemento `<audio>` nativo por baixo (o navegador cuida do codec: o
 * mesmo anexo pode ser WebM/Opus vindo do Android e MP4/AAC vindo do iPhone),
 * mas com controles próprios — os nativos ocupam muito espaço na timeline e
 * ficam diferentes em cada navegador.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { formatDuration } from './mediaProcess';
import type { NoteAttachment } from '../../../types/crm';

interface AudioPlayerProps {
  attachment: NoteAttachment;
  canDelete: boolean;
  onDelete: () => Promise<void>;
}

const SPEEDS = [1, 1.5, 2];

export function AudioPlayer({ attachment, canDelete, onDelete }: AudioPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(attachment.durationMs ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (el) el.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audio.current;
    if (!el || !durationMs) return;
    el.currentTime = (Number(e.target.value) / 100) * (durationMs / 1000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const percent = durationMs ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <div className="audio-player">
      <audio
        ref={audio}
        src={attachment.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPositionMs(0); }}
        onTimeUpdate={e => setPositionMs(Math.round(e.currentTarget.currentTime * 1000))}
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          // Gravação com duração desconhecida (`Infinity`) é comum em áudio de
          // MediaRecorder; nesse caso ficamos com a duração medida no upload.
          if (Number.isFinite(d) && d > 0) setDurationMs(Math.round(d * 1000));
        }}
      />

      <button
        type="button"
        className="icon-btn audio-play"
        onClick={toggle}
        aria-label={playing ? `Pausar ${attachment.name}` : `Reproduzir ${attachment.name}`}
      >
        <Icon name={playing ? 'Pause' : 'Play'} size={16} color="var(--primary)" fill="var(--primary)" />
      </button>

      <div className="audio-body">
        <input
          className="audio-seek"
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={seek}
          aria-label={`Posição de ${attachment.name}`}
          disabled={!durationMs}
        />
        <span className="muted audio-time">
          {formatDuration(positionMs)} / {formatDuration(durationMs)}
        </span>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm audio-speed"
        onClick={() => setSpeedIndex(i => (i + 1) % SPEEDS.length)}
        aria-label="Velocidade de reprodução"
      >
        {SPEEDS[speedIndex]}x
      </button>

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
