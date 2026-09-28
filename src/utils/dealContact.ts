import type { Contact, Deal } from '../types/crm';

type DealContactFields = Pick<Deal, 'contactId' | 'company'>;

/**
 * Resolve o contato de um negócio. `contactId` é a fonte de verdade (vínculo
 * explícito feito no card); só cai para o match por nome da empresa quando o
 * campo está ausente, pra não quebrar deals criados antes dele existir. Um
 * `contactId` que não bate com nenhum contato (ex.: contato excluído) não cai
 * no fallback — o vínculo explícito foi desfeito, então é melhor mostrar "sem
 * contato" do que resolver para uma empresa homônima.
 */
export function resolveDealContact(deal: DealContactFields, contacts: Contact[]): Contact | undefined {
  if (deal.contactId) {
    return contacts.find(c => c.id === deal.contactId);
  }
  return contacts.find(c => c.company === deal.company);
}

/** Contatos candidatos a vínculo: mesma empresa do negócio. */
export function contactsForDealCompany(deal: Pick<Deal, 'company'>, contacts: Contact[]): Contact[] {
  return contacts.filter(c => c.company === deal.company);
}
