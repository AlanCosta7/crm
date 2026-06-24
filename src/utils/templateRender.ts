/**
 * templateRender.ts — Renderização de variáveis de PlaybookTemplate
 *
 * Substitui placeholders no formato {{variavel}} pelos valores do contexto
 * (deal, contato, vendedor). Usado pelos modais de Email/WhatsApp do card.
 */

export interface TemplateContext {
  contato?: string;
  empresa?: string;
  vendedor?: string;
  negocio?: string;
  valor?: string;
  produto?: string;
  [key: string]: string | undefined;
}

/**
 * Substitui {{chave}} pelo valor correspondente do contexto.
 * Aceita espaços internos: {{ contato }} também funciona.
 * Placeholders sem valor no contexto são mantidos como estão.
 */
export function renderTemplate(text: string, ctx: TemplateContext): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = ctx[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

/** Lista as variáveis usadas em um texto (sem duplicatas). */
export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[1]);
  return [...found];
}
