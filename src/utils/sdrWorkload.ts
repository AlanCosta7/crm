/**
 * sdrWorkload.ts — carga atual de cada SDR (cards abertos em cadência agora).
 *
 * Fase D2 do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md. Extraído do cálculo que já
 * existia inline em `PainelBDR` (DashboardPage.tsx, monitor "Cadência dos SDRs
 * hoje") — vira a fonte única usada tanto no painel quanto no seletor de
 * atribuição manual do BDR (AssignSdrModal), evitando duas contas divergentes
 * do mesmo número.
 *
 * É o contador de quantos cards o SDR JÁ TEM agora, usado pra guiar a
 * distribuição manual justa (menor carga primeiro).
 */
import type { Deal, ProductScope } from '../types/crm';
import { matchesProductId } from './productScope';
import { effectiveCompanySize, type CompanySizeEstimate } from './companySize';

export interface SdrWorkload {
  sdrId: string;
  /** Cards com status 'open' atribuídos a esse SDR agora, no escopo de produto ativo. */
  leads: number;
  /** Mesma contagem, quebrada por porte (Fase D3) — sem classificação conta como 'M'. */
  bySize: Record<CompanySizeEstimate, number>;
}

type WorkloadDeal = Pick<Deal, 'assignedSdrId' | 'status' | 'productId' | 'companySizeEstimate'>;

export function getSdrWorkload(
  deals: WorkloadDeal[],
  sdrIds: string[],
  productScope: ProductScope,
): SdrWorkload[] {
  return sdrIds.map(sdrId => {
    const sdrDeals = deals.filter(d =>
      d.assignedSdrId === sdrId
      && d.status === 'open'
      && matchesProductId(productScope, d.productId || 'wizmart')
    );
    const bySize: Record<CompanySizeEstimate, number> = { P: 0, M: 0, G: 0 };
    sdrDeals.forEach(d => { bySize[effectiveCompanySize(d)] += 1; });
    return { sdrId, leads: sdrDeals.length, bySize };
  });
}
