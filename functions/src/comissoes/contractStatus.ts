/**
 * contractStatus.ts — regras puras do contrato de Comodato Smart Café (cópia do servidor)
 *
 * Fase 5.4 do PLANO_DESENHO_CRM.md (slide 11): "Gostaria de ter um espaço
 * dentro do card da Smart Café para anexar o contrato e um 'check' para
 * alguém do time financeiro clicar dizendo que foi pago."
 *
 * Só se aplica ao SKU `smartcafe_comodato` — os outros SKUs comissionam por
 * gatilho de faturamento, não por contrato assinado.
 *
 * ⚠️ DUPLICAÇÃO CONSCIENTE: existe uma cópia idêntica em
 * `src/features/deals/contractStatus.ts`. `contractReminderEmail.ts` (dia 09,
 * 9h BRT) usa a MESMA definição de "pendente" que a fila `/financeiro/contratos`
 * do front — se divergissem, o e-mail avisaria de algo que a tela não mostra,
 * ou o contrário. Mesmo arranjo de `timeBlocks.ts`/`dealOrigin.ts` — pacotes
 * sem import entre si.
 */

export const COMODATO_SKU = "smartcafe_comodato";

interface DealLike {
  mainProduct?: string;
  contract?: { url?: string } | null;
  contractPaidAt?: unknown;
}

/** O deal é um Comodato Smart Café? Só ele tem o slot de contrato. */
export function isComodato(deal: DealLike): boolean {
  return deal.mainProduct === COMODATO_SKU;
}

/** Tem contrato anexado (independente de já ter sido validado)? */
export function hasContract(deal: DealLike): boolean {
  return !!deal.contract?.url;
}

/** Financeiro já confirmou o pagamento da 1ª mensalidade? */
export function isContractPaid(deal: DealLike): boolean {
  return !!deal.contractPaidAt;
}

/**
 * Precisa da atenção do financeiro: é comodato, tem contrato anexado, e ainda
 * não foi marcado como pago. É a condição da fila `/financeiro/contratos` e
 * do e-mail do dia 09 — as duas cópias deste arquivo usam a MESMA função.
 */
export function isPendingValidation(deal: DealLike): boolean {
  return isComodato(deal) && hasContract(deal) && !isContractPaid(deal);
}

export type ContractStatus = "nao_aplica" | "sem_contrato" | "pendente" | "pago";

/** Estado do contrato para exibição — um valor só, para não checar 3 booleans na UI. */
export function contractStatus(deal: DealLike): ContractStatus {
  if (!isComodato(deal)) return "nao_aplica";
  if (!hasContract(deal)) return "sem_contrato";
  if (!isContractPaid(deal)) return "pendente";
  return "pago";
}
