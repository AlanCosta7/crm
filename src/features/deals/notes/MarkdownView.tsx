/**
 * Renderiza o markdown de uma nota com sanitização.
 *
 * A árvore passa por `rehype-sanitize` com o schema restrito de
 * `markdownSanitize.ts` — nunca usamos `dangerouslySetInnerHTML`.
 *
 * As checkboxes das listas de tarefa ficam clicáveis quando
 * `onToggleChecklist` é passado (só o autor recebe). O índice de cada item vem
 * do plugin `rehypeChecklistIndex`, que numera na ordem do documento depois da
 * sanitização — o `position` original não sobrevive ao `rehype-sanitize`, e um
 * contador mutável entre renders desalinharia.
 */
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { noteSanitizeSchema, safeHref } from './markdownSanitize';
import { parseMentionHref, MENTION_PREFIX } from './mentions';
import { rehypeChecklistIndex } from './rehypeChecklistIndex';

interface MarkdownViewProps {
  body: string;
  /** Chamado ao clicar num chip de menção — ausente deixa o chip inerte */
  onMentionClick?: (uid: string) => void;
  /** Recebe o índice do item clicado; ausente = checkboxes só de leitura */
  onToggleChecklist?: (index: number) => void;
  className?: string;
}

export function MarkdownView({ body, onToggleChecklist, onMentionClick, className }: MarkdownViewProps) {
  return (
    <div className={`md-body ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, noteSanitizeSchema], rehypeChecklistIndex]}
        /*
         * O react-markdown tem a própria higienização de URL, que zera
         * qualquer esquema fora de http/https/mailto/tel — inclusive o `wm:`
         * das menções. Liberamos só ele e mantemos o padrão para o resto, que
         * segue sendo a primeira barreira contra `javascript:` e afins.
         */
        urlTransform={url =>
          url.startsWith(MENTION_PREFIX) ? url : defaultUrlTransform(url)
        }
        components={{
          a({ href, children, ...rest }) {
            // Menção nunca vira âncora: sai como chip, então o esquema `wm:`
            // não tem como chegar ao DOM.
            const mentionUid = parseMentionHref(href);
            if (mentionUid) {
              return (
                <span
                  className={`md-mention ${onMentionClick ? 'md-mention-link' : ''}`}
                  role={onMentionClick ? 'button' : undefined}
                  tabIndex={onMentionClick ? 0 : undefined}
                  onClick={onMentionClick ? () => onMentionClick(mentionUid) : undefined}
                  onKeyDown={
                    onMentionClick
                      ? e => { if (e.key === 'Enter' || e.key === ' ') onMentionClick(mentionUid); }
                      : undefined
                  }
                >
                  {children}
                </span>
              );
            }

            // Segunda barreira de protocolo: href fora da allowlist vira texto
            const safe = safeHref(href);
            if (!safe) return <span>{children}</span>;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
          input({ node, checked, type, ...rest }) {
            if (type !== 'checkbox') return null;
            const idx = node?.properties?.dataCheckIndex;
            const canToggle = !!onToggleChecklist && typeof idx === 'number';
            return (
              <input
                {...rest}
                type="checkbox"
                checked={!!checked}
                disabled={!canToggle}
                className="md-check"
                onChange={() => {
                  if (canToggle) onToggleChecklist(idx as number);
                }}
              />
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
