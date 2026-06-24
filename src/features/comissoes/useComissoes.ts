/**
 * useComissoes.ts — Acesso de dados da feature de comissões.
 * Reusa os hooks genéricos multi-tenant (tenants/{tid}/commissions).
 */

import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Commission } from './types';

export function useComissoes() {
  const { data, loading, error } = useFirestoreCollection<Commission>('commissions');
  const { addDocument, updateDocument, deleteDocument } = useFirestoreMutations('commissions');

  return {
    comissoes: data,
    loading,
    error,
    criarComissao: (c: Omit<Commission, 'id'>) => addDocument(c),
    atualizarComissao: (id: string, patch: Partial<Commission>) => updateDocument(id, patch),
    excluirComissao: (id: string) => deleteDocument(id),
  };
}
