/**
 * reassignCarteira.ts — Fase 6.2 do PLANO_DESENHO_CRM.md: ao inativar um
 * sdr/rep, decide quais deals em carteira aberta precisam de um novo
 * responsável.
 *
 * Só o campo de atribuição do PRÓPRIO papel é tocado (`assignedSdrId` para
 * sdr, `assignedRepId` para rep) — `owner` marca quem originou o card e não
 * faz parte da "carteira" que se reatribui aqui. `participantIds`/
 * `responsibleId` são recalculados no servidor por `onDealParticipantsChanged`
 * assim que a escrita chega, então não entram nesta lista.
 *
 * Deals `won`/`lost` ficam de fora: carteira "ativa" é só o que ainda está em
 * aberto — negócio fechado não precisa de dono novo.
 */
import type { Deal, UserRole } from '../../types/crm';

export interface ReassignmentWrite {
  dealId: string;
  field: 'assignedSdrId' | 'assignedRepId';
}

const FIELD_BY_ROLE: Partial<Record<UserRole, ReassignmentWrite['field']>> = {
  sdr: 'assignedSdrId',
  rep: 'assignedRepId',
};

export function dealsToReassign(
  deals: Pick<Deal, 'id' | 'status' | 'assignedSdrId' | 'assignedRepId'>[],
  fromUid: string,
  role: UserRole,
): ReassignmentWrite[] {
  const field = FIELD_BY_ROLE[role];
  if (!field || !fromUid) return [];

  return deals
    .filter((deal) => (deal.status ?? 'open') === 'open' && deal[field] === fromUid)
    .map((deal) => ({ dealId: deal.id as string, field }));
}
