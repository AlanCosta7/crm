import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
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
 *
 * Nota sobre "Visualizar como" (impersonação, ./impersonation.ts): o estado
 * "esta sessão é uma impersonação" NÃO vive em claim de custom token. Claims
 * extras passadas a `admin.auth().createCustomToken(uid, extra)` só aparecem
 * no ID token gerado NAQUELE exchange específico — o próximo refresh (e este
 * hook força um logo abaixo, com `getIdTokenResult(true)`) busca um token novo
 * derivado só das claims persistidas na conta (`setCustomUserClaims`), e as
 * claims extras somem. Por isso quem está impersonando é rastreado por um doc
 * em `tenants/{tid}/active_impersonations/{uid}` (veja `useImpersonationSession`),
 * não por nada no token.
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
          //
          // O fallback do papel é 'viewer', NUNCA 'master' (PLANO_DESENHO_CRM.md
          // Fase 0): claim de papel é gravada no convite (`inviteUser`), no seed
          // e pela CF `onUserProfileWritten` — uma conta autenticada que chegue
          // aqui sem ela é anomalia, e anomalia não pode virar administrador.
          const tokenResult = await firebaseUser.getIdTokenResult(true);
          const tenantId = (tokenResult.claims.tenantId as string) || 'wizmart_sp';
          const roleClaim = tokenResult.claims.role as UserState['role'] | undefined;
          const role: UserState['role'] = roleClaim || 'viewer';
          if (!roleClaim) {
            console.warn(`[useAuth] ${firebaseUser.uid} sem claim de papel — sessão rebaixada a viewer.`);
          }

          // 2. Assina em tempo real o documento do usuário
          const userDocRef = doc(db, 'tenants', tenantId, 'users', firebaseUser.uid);
          
          let lastPoints: number | null = null;
          let lastCoins: number | null = null;
          // `undefined` = ainda não vimos a 1ª leitura desta sessão do listener.
          let seenForceLogoutAt: number | null | undefined = undefined;

          unsubUser = onSnapshot(userDocRef, (userSnap) => {
            if (userSnap.exists()) {
              const data = userSnap.data();

              // "Encerrar Sessão" (PLANO_DESENHO_CRM.md Fase 6.1): revogar o
              // refresh token não derruba uma sessão já aberta — o ID token em
              // cache no navegador continua válido por até 1h sem precisar de
              // refresh. `forceLogoutAt` é o sinal que chega EM TEMPO REAL por
              // este mesmo listener (já assinado para toasts de moeda/ponto).
              //
              // Comparamos com o ÚLTIMO valor visto NESTA sessão do listener —
              // não com `lastSignInTime` do Firebase Auth, que o SDK não
              // preenche de forma confiável contra o emulador. A 1ª leitura
              // após assinar só grava a base (evita derrubar a sessão nova por
              // causa de um encerramento antigo, já lido antes deste login);
              // qualquer mudança depois disso é um encerramento ao vivo, igual
              // ao delta de pontos/moedas logo abaixo.
              const forceLogoutAtMs = typeof data.forceLogoutAt?.toMillis === 'function'
                ? data.forceLogoutAt.toMillis()
                : null;
              if (seenForceLogoutAt === undefined) {
                seenForceLogoutAt = forceLogoutAtMs;
              } else if (forceLogoutAtMs !== seenForceLogoutAt) {
                seenForceLogoutAt = forceLogoutAtMs;
                useToastStore.getState().addToast({
                  type: 'info',
                  message: 'Sua sessão foi encerrada',
                  sub: 'Um administrador encerrou este acesso. Faça login novamente para continuar.',
                  duration: 8000,
                });
                // Limpa o store ANTES do signOut() assíncrono, igual ao
                // `handleLogout` da Sidebar — sem isso, quando o Firebase
                // Auth disparar `onAuthStateChanged(null)` de verdade, a
                // salvaguarda de mock do E2E (linha ~36: "usuário ainda no
                // store, não sobrescreve") acha que é um usuário mockado e
                // MANTÉM a sessão velha no ar, e o app nunca volta ao login.
                setUser(null);
                signOut(auth);
                return;
              }

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
          // Sessão encerrada pelo servidor: a CF `onUserProfileWritten` revoga os
          // refresh tokens quando papel, produtos ou acesso mudam, e o refresh
          // falha aqui. Sem esta mensagem o usuário só é jogado no login sem
          // explicação nenhuma (PLANO_DESENHO_CRM.md Fase 0).
          const code = (error as { code?: string } | null)?.code ?? '';
          if (code === 'auth/user-token-expired' || code === 'auth/user-disabled') {
            useToastStore.getState().addToast({
              type: 'info',
              message: 'Sua sessão foi encerrada',
              sub: code === 'auth/user-disabled'
                ? 'Seu acesso foi desativado pela administração.'
                : 'Suas permissões mudaram — entre novamente para continuar.',
              duration: 8000,
            });
          }
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
