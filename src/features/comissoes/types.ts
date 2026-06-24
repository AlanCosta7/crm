/**
 * types.ts — Modelo do documento de comissão persistido no Firestore.
 * Coleção: tenants/{tenantId}/commissions/{commissionId}
 */

import type { ProductSKU, ProductId } from '../../types/crm';
import type { CommissionTier, ComissaoSplit, Parcela } from './calc';

export type CommissionStatus = 'projetada' | 'confirmada' | 'paga' | 'cancelada';

/** Linha de rateio individual — uma por papel (assinatura do card). */
export interface CommissionShare {
  role: 'bdr' | 'sdr' | 'rep';
  userId: string;
  userName: string;
  /** Tier do SDR no momento do cálculo (snapshot). */
  tier?: CommissionTier;
  valor: number;
}

export interface Commission {
  id?: string;

  // Vínculo de origem
  dealId: string;
  dealName: string;
  productId?: ProductId;
  sku: ProductSKU;

  // Entrada do cálculo (snapshot — para auditoria e reprocesso)
  faturamentoInformado: number;   // valor vendido informado pelo gerente
  diasDecorridos?: number;        // dias desde a ativação até a avaliação
  faturamentoProjetado?: number;  // (vendido/dias)*30
  baseCalculo: number;            // base efetiva do rateio (proporcional = vendido)
  tabelaCheia?: boolean;          // Máquina de Café
  primeiraFaturaPaga?: boolean;   // Comodato
  proporcional: boolean;          // pago por projeção (dia 10)?

  // Resultado
  split: ComissaoSplit;
  shares: CommissionShare[];
  /** uids dos beneficiários — usado nas rules p/ leitura do próprio registro. */
  beneficiaryIds: string[];

  // Comodato (parcelamento manual)
  parcelas?: Parcela[];

  // Ciclo de pagamento
  dataAtivacao?: string;          // ISO — inauguração/instalação
  dataPagamento?: string;         // ISO — dia 15 elegível
  status: CommissionStatus;

  // Metadados
  observacao?: string;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}
