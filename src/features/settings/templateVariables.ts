/**
 * templateVariables.ts — Catálogo de variáveis de merge disponíveis nos
 * PlaybookTemplate (email/whatsapp).
 *
 * Espelha o `ctx` montado em EmailActionModal.tsx e WhatsAppActionModal.tsx —
 * se um desses componentes ganhar uma variável nova, adicione aqui também.
 * É a única fonte visível ao usuário: antes desta tela, só existia no código.
 */

import { extractVariables } from '../../utils/templateRender';

export interface TemplateVariableDef {
  key: string;
  label: string;
  sample: string;
}

export const TEMPLATE_VARIABLES: TemplateVariableDef[] = [
  { key: 'contato',  label: 'Nome do contato',                  sample: 'Maria Silva' },
  { key: 'empresa',  label: 'Empresa do negócio',                sample: 'Empresa Exemplo Ltda' },
  { key: 'vendedor', label: 'Quem está enviando (usuário logado)', sample: 'João Vendedor' },
  { key: 'negocio',  label: 'Nome do negócio (deal)',            sample: 'Negócio Exemplo — Loja Centro' },
  { key: 'valor',    label: 'Valor do negócio',                  sample: 'R$ 12.345,00' },
  { key: 'produto',  label: 'Produto (WizMart ou Smart Café)',   sample: 'WizMart' },
];

export const TEMPLATE_SAMPLE_CONTEXT: Record<string, string> =
  Object.fromEntries(TEMPLATE_VARIABLES.map(v => [v.key, v.sample]));

/** Variáveis usadas no texto que não existem no contexto real — ficariam literais na mensagem enviada. */
export function unknownTemplateVariables(text: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.map(v => v.key));
  return extractVariables(text).filter(v => !known.has(v));
}
