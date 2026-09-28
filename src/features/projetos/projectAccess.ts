/**
 * projectAccess.ts — quem vê o botão "Solicitar Projeto" no card
 * (PLANO_DESENHO_CRM_2.md, A1 — slides 4 e 5 do "Desenho CRM 2").
 *
 * O cliente não encontrou o botão. A causa: ele só aparecia se
 * `deal.mainProduct === 'wizmart_minimercado'`, então um card sem `mainProduct`
 * (ou de outro SKU) ficava sem botão — e, ao mesmo tempo, `viewer` e `design`
 * viam o botão e tomavam permission-denied ao enviar.
 *
 * Regra nova, alinhada às `firestore.rules` de `project_requests`:
 *  - papel que pode gravar: bdr, sdr, rep, manager, master;
 *  - quem não é gestão precisa PARTICIPAR do card ("o Representante ou quem
 *    estiver responsável nessa fase") — mesmo critério de `isDealParticipant`;
 *  - card de WizMart (produto ausente conta como WizMart, o padrão do sistema);
 *  - card perdido não pede projeto.
 */
import type { Deal } from '../../types/crm';

export const PROJECT_REQUEST_ROLES = ['bdr', 'sdr', 'rep', 'manager', 'master'] as const;
const MANAGEMENT_ROLES = ['manager', 'master'];

export interface ProjectAccessUser {
  uid?: string;
  role?: string;
}

export function isDealParticipantOf(uid: string | undefined, deal: Partial<Deal>): boolean {
  if (!uid) return false;
  return (
    (deal.participantIds ?? []).includes(uid) ||
    deal.owner === uid ||
    deal.bdrId === uid ||
    deal.assignedSdrId === uid ||
    deal.assignedRepId === uid
  );
}

export function canRequestProject(user: ProjectAccessUser | null | undefined, deal: Partial<Deal>): boolean {
  if (!user?.role || !(PROJECT_REQUEST_ROLES as readonly string[]).includes(user.role)) return false;
  if ((deal.productId ?? 'wizmart') !== 'wizmart') return false;
  if (deal.status === 'lost') return false;
  if (MANAGEMENT_ROLES.includes(user.role)) return true;
  return isDealParticipantOf(user.uid, deal);
}
