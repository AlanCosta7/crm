import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { UserState } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';

/**
 * Hook de Autenticação Global.
 * Sincroniza a sessão de login do Firebase Auth com claims no Zustand authStore.
 * Assina em tempo real o perfil do usuário no Firestore para atualizar moedas/pontos e disparar Toasts.
 */
export function useAuth() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    let unsubUser = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      // Corta o listener anterior ao mudar de sessão
      unsubUser();

      if (!firebaseUser && useAuthStore.getState().user !== null) {
        // Mantém o usuário mock do E2E ativo sem sobrescrevê-lo
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      if (firebaseUser) {
        try {
          // 1. Obtém o token e decodifica as custom claims (tenantId, role)
          const tokenResult = await firebaseUser.getIdTokenResult(true);
          const tenantId = (tokenResult.claims.tenantId as string) || 'wizmart_sp';
          const role = (tokenResult.claims.role as UserState['role']) || 'master';

          // 2. Assina em tempo real o documento do usuário
          const userDocRef = doc(db, 'tenants', tenantId, 'users', firebaseUser.uid);
          
          let lastPoints: number | null = null;
          let lastCoins: number | null = null;

          unsubUser = onSnapshot(userDocRef, (userSnap) => {
            if (userSnap.exists()) {
              const data = userSnap.data();
              const name = data.name || firebaseUser.displayName || 'Vendedor WizMart';
              const color = data.color || '#1A6B1A';
              const initials = data.initials || 'WM';
              
              const points = data.points || 0;
              const coinBalance = data.coinBalance || 0;
              const streak = data.streak || 0;

              // Dispara Toasts ao vivo se houver incremento!
              if (lastPoints !== null && points > lastPoints) {
                useToastStore.getState().addToast({
                  type: 'points',
                  message: 'Pontos Ganhos! ⚡',
                  pointsAmount: points - lastPoints,
                });
              }

              if (lastCoins !== null && coinBalance > lastCoins) {
                useToastStore.getState().addToast({
                  type: 'coins',
                  message: 'Moedas Adicionadas! 🪙',
                  coinsAmount: coinBalance - lastCoins,
                });
              }

              lastPoints = points;
              lastCoins = coinBalance;

              const userState: UserState = {
                uid: firebaseUser.uid,
                name,
                email: firebaseUser.email || '',
                initials,
                color,
                role,
                tenantId,
                coinBalance,
                points,
                streak,
                productIds: data.productIds || ['wizmart'],
                calendarConnected: data.calendarConnected || false,
              };
              setUser(userState);
            } else {
              // Se o documento ainda não existir (ambiente dev novo), faz um parse básico
              const initials = firebaseUser.displayName 
                ? firebaseUser.displayName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() 
                : 'WM';
                
              setUser({
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'Vendedor WizMart',
                email: firebaseUser.email || '',
                initials,
                color: '#1A6B1A',
                role,
                tenantId,
                coinBalance: 0,
                points: 0,
                streak: 0,
                productIds: ['wizmart'],
              });
            }
            setLoading(false);
          }, (err) => {
            console.error('[useAuth] Erro na assinatura do perfil do usuário:', err);
            setLoading(false);
          });

        } catch (error) {
          console.error('[useAuth] Erro ao decodificar claims do Firebase:', error);
          setUser(null);
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubUser();
    };
  }, [setUser, setLoading]);
}

export default useAuth;
