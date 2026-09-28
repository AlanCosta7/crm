/**
 * Manipulação de texto do editor markdown — funções puras sobre
 * `(texto, seleção)`, para a toolbar e os atalhos de teclado poderem ser
 * testados sem montar componente nenhum.
 *
 * Toda função devolve `{ text, start, end }`: o texto novo e onde a seleção
 * deve ficar depois (o chamador reposiciona o cursor na textarea).
 */

export interface EditResult {
  text: string;
  start: number;
  end: number;
}

export interface Selection {
  start: number;
  end: number;
}

/**
 * Envolve a seleção com um marcador (`**`, `_`, `~~`, `` ` ``).
 * Se a seleção já estiver envolvida, remove — é um toggle.
 * Sem seleção, insere o par e deixa o cursor no meio.
 */
export function toggleWrap(text: string, sel: Selection, marker: string): EditResult {
  const { start, end } = sel;
  const selected = text.slice(start, end);
  const len = marker.length;

  // Marcador por fora da seleção: "**|texto|**" → tira
  const outerBefore = text.slice(Math.max(0, start - len), start);
  const outerAfter = text.slice(end, end + len);
  if (outerBefore === marker && outerAfter === marker) {
    return {
      text: text.slice(0, start - len) + selected + text.slice(end + len),
      start: start - len,
      end: end - len,
    };
  }

  // Marcador por dentro da seleção: "|**texto**|" → tira
  if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, -len);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    start: start + len,
    end: end + len,
  };
}

/** Início da linha que contém a posição `pos`. */
function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
}

/** Fim da linha que contém a posição `pos`. */
function lineEnd(text: string, pos: number): number {
  const i = text.indexOf('\n', pos);
  return i === -1 ? text.length : i;
}

/**
 * Aplica (ou remove) um prefixo em todas as linhas da seleção — listas,
 * citação, títulos. `prefixFor` recebe o índice da linha, para a lista
 * ordenada conseguir numerar.
 */
export function togglePrefix(
  text: string,
  sel: Selection,
  prefixFor: (index: number) => string,
  matcher: RegExp
): EditResult {
  const from = lineStart(text, sel.start);
  const to = lineEnd(text, sel.end);
  const block = text.slice(from, to);
  const lines = block.split('\n');

  const allPrefixed = lines.every(l => matcher.test(l));
  const next = lines
    .map((l, i) => (allPrefixed ? l.replace(matcher, '') : prefixFor(i) + l))
    .join('\n');

  return {
    text: text.slice(0, from) + next + text.slice(to),
    start: from,
    end: from + next.length,
  };
}

export const toggleBulletList = (t: string, s: Selection) =>
  togglePrefix(t, s, () => '- ', /^- /);

export const toggleOrderedList = (t: string, s: Selection) =>
  togglePrefix(t, s, i => `${i + 1}. `, /^\d+\.\s/);

export const toggleChecklist = (t: string, s: Selection) =>
  togglePrefix(t, s, () => '- [ ] ', /^- \[[ xX]\] /);

export const toggleQuote = (t: string, s: Selection) =>
  togglePrefix(t, s, () => '> ', /^> /);

export const toggleHeading = (t: string, s: Selection) =>
  togglePrefix(t, s, () => '## ', /^#{1,6} /);

/**
 * Insere um link markdown. Com texto selecionado, ele vira o rótulo e o cursor
 * cai dentro dos parênteses (pronto para colar/digitar a URL). Sem seleção,
 * insere o esqueleto com o rótulo selecionado.
 */
export function insertLink(text: string, sel: Selection, url = ''): EditResult {
  const label = text.slice(sel.start, sel.end) || 'texto';
  const snippet = `[${label}](${url})`;
  const inserted = text.slice(0, sel.start) + snippet + text.slice(sel.end);

  if (sel.start === sel.end) {
    // Sem seleção: deixa o rótulo selecionado para o usuário sobrescrever
    return { text: inserted, start: sel.start + 1, end: sel.start + 1 + label.length };
  }
  // Com seleção: cursor dentro dos parênteses, na posição da URL
  const urlAt = sel.start + label.length + 3;
  return { text: inserted, start: urlAt, end: urlAt + url.length };
}

/** Bloco de código cercado por ``` — usa crase simples quando é inline. */
export function toggleCode(text: string, sel: Selection): EditResult {
  const selected = text.slice(sel.start, sel.end);
  if (selected.includes('\n')) {
    const snippet = '```\n' + selected + '\n```';
    return {
      text: text.slice(0, sel.start) + snippet + text.slice(sel.end),
      start: sel.start + 4,
      end: sel.start + 4 + selected.length,
    };
  }
  return toggleWrap(text, sel, '`');
}

/**
 * Alterna o item de checklist de índice `index` (contando na ordem em que
 * aparecem no texto). Usado pelas checkboxes clicáveis da nota renderizada —
 * `react-markdown` numera as tarefas na mesma ordem do corpo.
 */
export function toggleChecklistItem(body: string, index: number): string {
  const re = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/gm;
  let n = -1;
  return body.replace(re, (match, before, mark, after) => {
    n += 1;
    if (n !== index) return match;
    return before + (mark === ' ' ? 'x' : ' ') + after;
  });
}

/** Conta quantos itens de checklist existem no corpo. */
export function countChecklistItems(body: string): number {
  return (body.match(/^(\s*(?:[-*+]|\d+\.)\s+\[[ xX]\])/gm) ?? []).length;
}

/**
 * Converte markdown em texto puro — usado no resumo que vai para o feed de
 * Atividades e na prévia da notificação de menção. Não é um parser: só remove
 * a marcação que atrapalha a leitura de um trecho curto.
 */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')          // blocos de código
    .replace(/`([^`]*)`/g, '$1')              // código inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links → só o rótulo
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')       // títulos
    .replace(/^\s{0,3}>\s?/gm, '')            // citação
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '') // listas e checkbox
    .replace(/(\*\*|__|~~|\*|_)/g, '')        // ênfase
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')    // linha horizontal
    .replace(/\s+/g, ' ')
    .trim();
}
