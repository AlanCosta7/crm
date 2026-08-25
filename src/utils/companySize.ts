/**
 * companySize.ts — rótulos e cores do porte estimado (P/M/G), Fase D3 do
 * PLANO_CARD_ASSINATURAS_VISIBILIDADE.md.
 *
 * Mesma paleta visual já usada pelo `clientSize` do Smart Café (Pequeno/Médio/
 * Grande em DealSidebar.tsx/PipelinePage.tsx) — reaproveitada aqui só pela
 * consistência visual; são campos e conceitos diferentes (ver comentário em
 * `Deal.companySizeEstimate` em types/crm.ts).
 */
import type { Deal } from '../types/crm';

export type CompanySizeEstimate = NonNullable<Deal['companySizeEstimate']>;

export const COMPANY_SIZE_LABEL: Record<CompanySizeEstimate, string> = {
  P: 'Pequeno',
  M: 'Médio',
  G: 'Grande',
};

export const COMPANY_SIZE_COLOR: Record<CompanySizeEstimate, { bg: string; text: string; border: string }> = {
  P: { bg: '#FAF2EC', text: '#5E3A26', border: '#D4A37344' },
  M: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B44' },
  G: { bg: '#EFF6FF', text: '#1E3A5F', border: '#3B82F644' },
};

/** Ausência de classificação conta como 'M' só para efeito de cálculo (distribuição balanceada). */
export function effectiveCompanySize(deal: Pick<Deal, 'companySizeEstimate'>): CompanySizeEstimate {
  return deal.companySizeEstimate ?? 'M';
}
