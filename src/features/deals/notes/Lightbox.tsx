/**
 * Visualizador de imagem e vídeo em tela cheia.
 *
 * Navegação por teclado (setas, Esc) e por swipe horizontal no celular. O
 * vídeo usa o player nativo — controles familiares, e o navegador cuida de
 * codec, tela cheia e picture-in-picture sem código nosso.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { formatBytes } from './attachments';
import type { NoteAttachment } from '../../../types/crm';

interface LightboxProps {
  items: NoteAttachment[];
  startIndex: number;
  onClose: () => void;
}

/** Distância mínima do swipe para trocar de item. */
const SWIPE_THRESHOLD = 60;

export function Lightbox({ items, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => setIndex(i => Math.min(items.length - 1, Math.max(0, i + delta))),
    [items.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Trava o scroll do fundo enquanto o visualizador está aberto
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const current = items[index];
  if (!current) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onClick={onClose}
      onTouchStart={e => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={e => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) >= SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <span className="lightbox-title" title={current.name}>{current.name}</span>
        <span className="lightbox-meta">
          {items.length > 1 && `${index + 1} de ${items.length} · `}
          {formatBytes(current.size)}
        </span>
        <a
          className="icon-btn lightbox-btn"
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir em nova aba"
          download={current.name}
        >
          <Icon name="Download" size={18} />
        </a>
        <button type="button" className="icon-btn lightbox-btn" onClick={onClose} aria-label="Fechar">
          <Icon name="X" size={20} />
        </button>
      </div>

      <div className="lightbox-stage" onClick={e => e.stopPropagation()}>
        {index > 0 && (
          <button
            type="button"
            className="icon-btn lightbox-nav lightbox-prev"
            onClick={() => go(-1)}
            aria-label="Anterior"
          >
            <Icon name="ChevronLeft" size={26} />
          </button>
        )}

        {current.kind === 'video' ? (
          <video
            key={current.id}
            className="lightbox-media"
            src={current.url}
            poster={current.thumbUrl}
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img key={current.id} className="lightbox-media" src={current.url} alt={current.name} />
        )}

        {index < items.length - 1 && (
          <button
            type="button"
            className="icon-btn lightbox-nav lightbox-next"
            onClick={() => go(1)}
            aria-label="Próximo"
          >
            <Icon name="ChevronRight" size={26} />
          </button>
        )}
      </div>
    </div>
  );
}
