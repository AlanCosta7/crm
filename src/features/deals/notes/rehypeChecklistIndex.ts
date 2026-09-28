/**
 * Numera as checkboxes das listas de tarefa na ordem do documento.
 *
 * `rehype-sanitize` reconstrói a árvore e descarta o `position` dos nós, então
 * não dá para derivar o índice do offset no markdown original. Este plugin
 * roda DEPOIS do sanitize e grava `data-check-index` em cada checkbox, pela
 * ordem da travessia — que é a mesma ordem em que os itens aparecem no corpo,
 * e a mesma que `toggleChecklistItem` usa.
 */

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

export function rehypeChecklistIndex() {
  return (tree: HastNode) => {
    let index = 0;
    const walk = (node: HastNode) => {
      if (node.tagName === 'input' && node.properties?.type === 'checkbox') {
        node.properties.dataCheckIndex = index;
        index += 1;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
