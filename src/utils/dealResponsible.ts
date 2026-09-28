/**
 * dealResponsible.ts — regra pura da troca de responsável do card
 * (autorização `manage_deal_cards`, 21/09/2026).
 *
 * O "responsável" NÃO é um campo gravável: `responsibleId` é derivado no
 * servidor por `onDealParticipantsChanged` como
 * `assignedRepId || assignedSdrId || bdrId || owner`. Trocar o responsável é,
 * portanto, trocar o campo de origem que hoje "vence" nessa cadeia — e só ele.
 * Mesmo princípio de `reassignCarteira.ts` (Fase 6.2): nunca mexer nos campos
 * dos outros papéis, para não apagar a assinatura de quem já passou pelo card.
 * `participantIds`/`responsibleId` são recalculados pela CF assim que a escrita
 * chega, então não entram no patch.
 */
import type { Deal, ProductId, UserRole } from '../types/crm';
import { computeResponsibleId } from './dealParticipants';

export type ResponsibleField = 'assignedRepId' | 'assignedSdrId' | 'bdrId' | 'owner';

type ResponsibleDeal = Pick<Deal, 'owner' | 'bdrId' | 'assignedSdrId' | 'assignedRepId'>;

/** Campo de origem que define o responsável atual (o primeiro preenchido da cadeia). */
export function responsibleField(deal: ResponsibleDeal): ResponsibleField {
  if (deal.assignedRepId) return 'assignedRepId';
  if (deal.assignedSdrId) return 'assignedSdrId';
  if (deal.bdrId) return 'bdrId';
  return 'owner';
}

/** Papéis que podem assumir cada campo. Gestão entra como Rep/dono, como no Pipeline. */
const ELIGIBLE_ROLES: Record<ResponsibleField, UserRole[]> = {
  assignedRepId: ['rep', 'manager', 'master'],
  assignedSdrId: ['sdr'],
  bdrId:         ['bdr'],
  owner:         ['master', 'manager', 'bdr', 'sdr', 'rep'],
};

export const RESPONSIBLE_FIELD_LABEL: Record<ResponsibleField, string> = {
  assignedRepId: 'Representante',
  assignedSdrId: 'SDR',
  bdrId:         'BDR',
  owner:         'Dono do card',
};

export interface ResponsibleCandidate {
  id?: string;
  role: UserRole;
  isActive?: boolean;
  productIds?: ProductId[];
}

/** Usuários ativos, do papel certo e com acesso ao produto do card, sem o responsável atual. */
export function eligibleResponsibles<T extends ResponsibleCandidate>(
  deal: ResponsibleDeal & Pick<Deal, 'productId'>,
  users: T[],
): T[] {
  const field = responsibleField(deal);
  const currentId = computeResponsibleId(deal);
  const productId: ProductId = deal.productId || 'wizmart';
  return users.filter(u =>
    !!u.id
    && u.id !== currentId
    && u.isActive !== false
    && ELIGIBLE_ROLES[field].includes(u.role)
    && (!u.productIds || u.productIds.length === 0 || u.productIds.includes(productId)),
  );
}

/** Patch de escrita (só o campo do responsável). */
export function buildResponsibleChange(
  deal: ResponsibleDeal,
  newUid: string,
): { field: ResponsibleField; patch: Partial<Record<ResponsibleField, string>> } {
  const field = responsibleField(deal);
  return { field, patch: { [field]: newUid } };
}
