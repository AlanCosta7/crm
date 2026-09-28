/**
 * Sabe se a sessão atual é uma impersonação ("Visualizar como").
 *
 * Assina `tenants/{tid}/active_impersonations/{uid}` — o doc é a fonte de
 * verdade (não claim de token; veja o comentário em useAuth.ts sobre por
 * quê). Some sozinho quando `endImpersonation` apaga o doc, então o banner
 * reage em tempo real ao encerramento, de qualquer origem.
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';

export interface ImpersonationInfo {
  actorUid: string;
  actorName: string;
  startedAt?: unknown;
}

export function useImpersonationSession(): ImpersonationInfo | null {
  const uid = useAuthStore(s => s.user?.uid);
  const tenantId = useAuthStore(s => s.user?.tenantId);
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    // Sem sessão, não há o que assinar — o `info` some via o cleanup da
    // assinatura anterior (ex.: logout), não por um setState direto aqui.
    if (!uid || !tenantId) return;

    const ref = doc(db, 'tenants', tenantId, 'active_impersonations', uid);
    const unsub = onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) {
          setInfo(null);
          return;
        }
        const data = snap.data();
        setInfo({
          actorUid: data.actorUid,
          actorName: data.actorName || 'Admin Master',
          startedAt: data.startedAt,
        });
      },
      // Sem o doc (usuário comum, sem permissão de ler o de outra pessoa) a
      // leitura nem deveria ter sido tentada para outro uid — para o PRÓPRIO
      // uid a rule sempre permite, então um erro aqui é rede/offline: mantém
      // o último estado conhecido em vez de fazer o banner sumir à toa.
      err => console.warn('[useImpersonationSession] erro na assinatura:', err)
    );

    return () => {
      unsub();
      setInfo(null);
    };
  }, [uid, tenantId]);

  return info;
}
