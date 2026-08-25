/**
 * dealQueryScope.ts — filtro obrigatório para ler a coleção `deals` sob a
 * security rule restrita a participantes (Fase B/B2 do
 * PLANO_CARD_ASSINATURAS_VISIBILIDADE.md).
 *
 * O Firestore rejeita POR INTEIRO uma query sem `where` que combine com a
 * rule quando ela depende de campo do documento (comprovado em
 * scripts/test-deal-read-rules-emulator.mjs) — não filtra silenciosamente os
 * docs que a rule barraria. Por isso toda tela que lê `deals` sem nenhum
 * filtro precisa deste constraint para BDR/SDR/Rep; manager/master/viewer/
 * design têm bypass na rule (`canSeeAllDeals`) e não devem receber o filtro,
 * senão passariam a ver só os próprios cards em vez de todos.
 */
import { where, type QueryConstraint } from 'firebase/firestore';
import type { UserState } from '../stores/authStore';

const ROLES_WITH_FULL_DEAL_ACCESS = new Set(['master', 'manager', 'viewer', 'design']);

/**
 * Constraint a passar como 2º argumento de `useFirestoreCollection<Deal>('deals', ...)`.
 * Vazio para papéis com leitura ampla (mesmo critério da rule `canSeeAllDeals`);
 * `participantIds array-contains uid` para os demais (bdr/sdr/rep).
 */
export function dealParticipantConstraint(user: Pick<UserState, 'uid' | 'role'> | null | undefined): QueryConstraint[] {
  if (!user?.uid) return [];
  if (ROLES_WITH_FULL_DEAL_ACCESS.has(user.role)) return [];
  return [where('participantIds', 'array-contains', user.uid)];
}
