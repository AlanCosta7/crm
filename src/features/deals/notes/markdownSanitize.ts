/**
 * Schema de sanitização do markdown das notas.
 *
 * O corpo da nota é markdown CRU escrito por gente do time — a renderização é
 * que precisa ser segura. Usamos `rehype-sanitize` (sanitiza a árvore HAST,
 * não a string), então nada de `dangerouslySetInnerHTML` em lugar nenhum.
 *
 * Diferenças propositais em relação ao schema padrão do GitHub:
 *  - `img` fora da lista: imagem por URL externa numa nota vazaria o IP de
 *    todo mundo que abrisse o card para um terceiro. Imagem entra como anexo.
 *  - `a` só com `href` (sem `name`/`id`), e o protocolo é checado de novo no
 *    componente de link.
 *  - `input` sobrevive apenas como checkbox das listas de tarefa do GFM.
 */
import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeOptions } from 'rehype-sanitize';

export const noteSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [
    'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'input',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  attributes: {
    a: ['href', 'title'],
    input: [['type', 'checkbox'], 'checked', 'disabled'],
    th: ['align'],
    td: ['align'],
    code: ['className'],
    li: ['className'],
    '*': [],
  },
  protocols: {
    // `wm` é o esquema das menções (`wm:user/<uid>`). Ele passa pelo
    // sanitizador porque o renderizador precisa enxergá-lo, mas nunca chega ao
    // DOM como href: menção vira `<span>`, não `<a>`.
    href: ['http', 'https', 'mailto', 'tel', 'wm'],
  },
  clobberPrefix: 'note-',
};

/** Protocolos aceitos num link renderizado — segunda barreira, no componente. */
const SAFE_LINK = /^(https?:|mailto:|tel:)/i;

/**
 * Normaliza o href de um link do markdown. Devolve `undefined` para qualquer
 * coisa que não seja um protocolo da allowlist (`javascript:`, `data:`, etc.),
 * o que faz o link virar texto simples em vez de âncora clicável.
 */
export function safeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  // Link relativo (#ancora, /rota) é seguro e não tem protocolo
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  return SAFE_LINK.test(trimmed) ? trimmed : undefined;
}
