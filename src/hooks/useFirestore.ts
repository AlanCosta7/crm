import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  QueryConstraint,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthStore } from '../stores/authStore';

// Hook para assinar uma Coleção Firestore isolada por Tenant em tempo real
//
// `cacheKey` (opcional): o efeito só reassina quando `queryConstraints.length`
// muda — se o CALLER troca o VALOR de um constraint mantendo a mesma
// quantidade (ex.: alternar o alvo de um `where('x','==', uid)` no toggle
// "Meus Cards"/"Cards de Outro Ator"), o listener antigo continua vivo com o
// valor velho. Passe uma string que mude junto com o valor do constraint
// (ex.: `${modo}:${alvoUid}`) pra forçar a reassinatura nesses casos.
export function useFirestoreCollection<T extends { id?: string }>(
  subCollectionName: string,
  queryConstraints: QueryConstraint[] = [],
  cacheKey?: string
) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const queryKey = [subCollectionName, user?.tenantId, ...queryConstraints.map(c => c.type)];

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.tenantId) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};
    try {
      // Constrói a referência da subcoleção sob o tenant logado (/tenants/{tenantId}/{subCollectionName})
      const colRef = collection(db, 'tenants', user.tenantId, subCollectionName);
      const q = query(colRef, ...queryConstraints);

      // Listener em tempo real do Firestore
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: T[] = [];
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() } as unknown as T);
          });

          setData(items);
          queryClient.setQueryData(queryKey, items);
          setLoading(false);
        },
        (error) => {
          console.error(`Erro ao assinar a coleção ${subCollectionName}:`, error);
          setError(error);
          setData([]);
          setLoading(false);
        }
      );
    } catch (err) {
      console.warn(`[useFirestoreCollection] Erro síncrono no onSnapshot da coleção ${subCollectionName}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setData([]);
      setLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, [user?.tenantId, subCollectionName, queryConstraints.length, cacheKey]);

  return { data, loading, error };
}

// Auxiliar para remover propriedades 'undefined' recursivamente antes de enviar ao Firestore
function removeUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // Preserva instâncias de classes customizadas (ex: Date, Firestore Timestamp, FieldValue)
  if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      result[key] = removeUndefined(obj[key]);
    }
  }
  return result;
}

// Hook de manipulação de dados (CRUD) no Firestore
export function useFirestoreMutations(subCollectionName: string) {
  const { user } = useAuthStore();

  const addDocument = async (data: DocumentData) => {
    if (!user?.tenantId) throw new Error('Usuário não autenticado no Tenant.');
    const colRef = collection(db, 'tenants', user.tenantId, subCollectionName);
    const cleanedData = removeUndefined(data);
    return await addDoc(colRef, {
      ...cleanedData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  const updateDocument = async (docId: string, data: Partial<DocumentData>) => {
    if (!user?.tenantId) throw new Error('Usuário não autenticado no Tenant.');
    const docRef = doc(db, 'tenants', user.tenantId, subCollectionName, docId);
    const cleanedData = removeUndefined(data);
    return await updateDoc(docRef, {
      ...cleanedData,
      updatedAt: new Date(),
    });
  };

  const deleteDocument = async (docId: string) => {
    if (!user?.tenantId) throw new Error('Usuário não autenticado no Tenant.');
    const docRef = doc(db, 'tenants', user.tenantId, subCollectionName, docId);
    return await deleteDoc(docRef);
  };

  const setDocument = async (docId: string, data: DocumentData) => {
    if (!user?.tenantId) throw new Error('Usuário não autenticado no Tenant.');
    const docRef = doc(db, 'tenants', user.tenantId, subCollectionName, docId);
    const cleanedData = removeUndefined(data);
    return await setDoc(docRef, {
      ...cleanedData,
      updatedAt: new Date(),
    });
  };

  return { addDocument, updateDocument, deleteDocument, setDocument };
}
