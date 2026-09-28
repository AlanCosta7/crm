/**
 * Barra de formatação do editor de notas.
 *
 * Não guarda estado: recebe o texto e a seleção atuais da textarea, chama o
 * utilitário puro correspondente e devolve o resultado para o composer
 * reposicionar o cursor. No mobile a barra rola na horizontal.
 */
import { memo } from 'react';
import { Icon } from '../../../components/ui/Icon';
import {
  toggleWrap,
  toggleHeading,
  toggleBulletList,
  toggleOrderedList,
  toggleChecklist,
  toggleQuote,
  toggleCode,
  insertLink,
  type EditResult,
  type Selection,
} from './markdownEdit';

interface MarkdownToolbarProps {
  onApply: (fn: (text: string, sel: Selection) => EditResult) => void;
  disabled?: boolean;
}

const ACTIONS: Array<{
  key: string;
  icon: string;
  title: string;
  fn: (t: string, s: Selection) => EditResult;
}> = [
  { key: 'bold',      icon: 'Bold',        title: 'Negrito (Ctrl+B)',  fn: (t, s) => toggleWrap(t, s, '**') },
  { key: 'italic',    icon: 'Italic',      title: 'Itálico (Ctrl+I)',  fn: (t, s) => toggleWrap(t, s, '_') },
  { key: 'strike',    icon: 'Strikethrough', title: 'Riscado',         fn: (t, s) => toggleWrap(t, s, '~~') },
  { key: 'heading',   icon: 'Heading2',    title: 'Título',            fn: toggleHeading },
  { key: 'bullet',    icon: 'List',        title: 'Lista',             fn: toggleBulletList },
  { key: 'ordered',   icon: 'ListOrdered', title: 'Lista numerada',    fn: toggleOrderedList },
  { key: 'checklist', icon: 'ListChecks',  title: 'Checklist',         fn: toggleChecklist },
  { key: 'quote',     icon: 'Quote',       title: 'Citação',           fn: toggleQuote },
  { key: 'code',      icon: 'Code',        title: 'Código',            fn: toggleCode },
  { key: 'link',      icon: 'Link',        title: 'Link (Ctrl+K)',     fn: (t, s) => insertLink(t, s) },
];

/**
 * Memoizado: são 10 ícones que não mudam enquanto o usuário digita. Depende de
 * `onApply` ser estável — veja o `bodyRef` no NoteComposer.
 */
export const MarkdownToolbar = memo(function MarkdownToolbar({ onApply, disabled }: MarkdownToolbarProps) {
  return (
    <div className="md-toolbar" role="toolbar" aria-label="Formatação">
      {ACTIONS.map(a => (
        <button
          key={a.key}
          type="button"
          className="md-tool"
          title={a.title}
          aria-label={a.title}
          disabled={disabled}
          // onMouseDown + preventDefault: manter o foco (e a seleção) na textarea
          onMouseDown={e => e.preventDefault()}
          onClick={() => onApply(a.fn)}
        >
          <Icon name={a.icon} size={15} />
        </button>
      ))}
    </div>
  );
});
