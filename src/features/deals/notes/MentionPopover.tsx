/**
 * Lista de sugestões que aparece ao digitar `@` no composer.
 *
 * Navegação por ↑ ↓ Enter Tab Esc no desktop; no celular é uma lista rolável
 * acima do teclado, tocável com o dedo. Quem controla a seleção é o composer
 * (que também escuta o teclado da textarea) — este componente só desenha.
 */
import { useEffect, useRef } from 'react';
import { Av } from '../../../components/ui/Av';
import type { MentionCandidate } from './mentions';

interface MentionPopoverProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onPick: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
}

export function MentionPopover({ candidates, activeIndex, onPick, onHover }: MentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Mantém a opção destacada visível quando se navega pelo teclado
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (candidates.length === 0) return null;

  return (
    <div className="mention-pop" ref={listRef} role="listbox" aria-label="Mencionar pessoa">
      {candidates.map((c, i) => (
        <button
          key={c.uid}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          className={`mention-option ${i === activeIndex ? 'active' : ''}`}
          // onMouseDown para não tirar o foco da textarea antes do clique
          onMouseDown={e => { e.preventDefault(); onPick(c); }}
          onMouseEnter={() => onHover(i)}
        >
          <Av name={c.name} initials={c.initials} color={c.color} size={24} />
          <span className="mention-name">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
