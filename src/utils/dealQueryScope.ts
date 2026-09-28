/**
 * dealQueryScope.ts — filtro obrigatório para ler a coleção `deals` sob a
 * security rule restrita a participantes (Fase B/B2 do
 * PLANO_CARD_ASSINATURAS_VISIBILIDADE.md).
 *
 * O Firestore rejeita POR INTEIRO uma query sem `where` que combine com a
 * rule quando ela depende de campo do documento (comprovado em
 * scripts/test-emulator/test-deal-read-rules-emulator.mjs) — não filtra silenciosamente os
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
 * Vazio para papéis com leitura ampla (rule `canSeeAllDeals`) e para quem tem a
 * autorização `manage_deal_cards` (rule `canManageAllDeals` — BDR por padrão,
 * ou qualquer perfil que o master tenha liberado); `participantIds array-contains
 * uid` para os demais.
 *
 * `canManageAllDeals` deve vir de `hasPermission('manage_deal_cards')`: a
 * permissão, e não o papel, decide — se o master a tirar do perfil BDR, a rule
 * volta a exigir o filtro e uma query sem `where` seria rejeitada por inteiro.
 */
export function dealParticipantConstraint(
  user: Pick<UserState, 'uid' | 'role'> | null | undefined,
  canManageAllDeals = false,
): QueryConstraint[] {
  if (!user?.uid) return [];
  if (canManageAllDeals || ROLES_WITH_FULL_DEAL_ACCESS.has(user.role)) return [];
  return [where('participantIds', 'array-contains', user.uid)];
}
