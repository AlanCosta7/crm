/**
 * dealParticipants.ts — mesma fórmula usada pela Cloud Function
 * `onDealParticipantsChanged` (functions/src/deals/syncDealParticipants.ts).
 *
 * Usado no client só para popular `participantIds`/`responsibleId` já corretos
 * no momento da criação do card (evita um instante em que o próprio criador
 * ainda não aparece como participante, antes da CF rodar). A CF continua sendo
 * a fonte da verdade — se as duas divergirem por qualquer motivo, o servidor
 * corrige na escrita seguinte.
 */
import type { Deal } from '../types/crm';

type DealParticipantFields = Pick<Deal, 'owner' | 'bdrId' | 'assignedSdrId' | 'assignedRepId'>;

export function computeParticipantIds(deal: DealParticipantFields): string[] {
  const raw = [deal.owner, deal.bdrId, deal.assignedSdrId, deal.assignedRepId];
  return [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

export function computeResponsibleId(deal: DealParticipantFields): string {
  return deal.assignedRepId || deal.assignedSdrId || deal.bdrId || deal.owner || '';
}
