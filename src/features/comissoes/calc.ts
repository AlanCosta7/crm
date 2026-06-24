/**
 * calc.ts — Núcleo puro da Calculadora de Comissão (WizMart CRM)
 *
 * Funções 100% puras e testáveis (sem Firebase, sem React). Toda a regra de
 * negócio de comissionamento vive aqui. A UI e a persistência consomem estas
 * funções.
 *
 * Regras de negócio (fonte: Admin / gerente comercial, 2026-06-23):
 *
 *  Rateio usa as "assinaturas do card" (Deal.bdrId / assignedSdrId / assignedRepId).
 *
 *  Tabela de tiers (modelo padrão):
 *    BDR 2% · SDR Junior 7,5% · SDR Pleno 8,75% · SDR Senior 10% · Rep 17,5%
 *
 *  Gatilhos (faturamento nos primeiros 30 dias de ativo):
 *    - WizMart Minimercado .............. R$ 3.000  → modelo padrão
 *    - Venda Direta Máq. de Snacks ...... R$ 2.000  → modelo padrão
 *    - Venda Direta Máq. de Café ........ R$ 1.000  → modelo CAFÉ (72%), exige tabela cheia
 *    - Comodato ......................... sem mínimo → modelo padrão, exige 1ª fatura paga
 *
 *  Modelo CAFÉ (regra especial): 72% total → Rep 49% + SDR 21% + BDR 2%.
 *
 *  Projeção (avaliação do dia 10): projeta (vendido ÷ dias decorridos) × 30.
 *  Se a projeção ≥ gatilho, paga-se a comissão PROPORCIONAL sobre o valor JÁ
 *  vendido (não sobre o projetado).
 *
 *  Pagamento sempre no dia 15; cliente ativado até o último dia do mês é
 *  elegível ao dia 15 seguinte.
 */

import type { ProductSKU, CommissionTier } from '../../types/crm';
export type { CommissionTier };

// ─── Tiers e percentuais ───────────────────────────────────────────────────────

export type CommissionModel = 'standard' | 'cafe';

/** Percentuais do modelo padrão, sobre o faturamento. */
export const STANDARD_RATES = {
  bdr: 0.02,
  sdr: { junior: 0.075, pleno: 0.0875, senior: 0.1 } as Record<CommissionTier, number>,
  rep: 0.175,
} as const;

/** Percentuais do modelo CAFÉ (72% total, fixos por papel). */
export const CAFE_RATES = {
  bdr: 0.02,
  sdr: 0.21,
  rep: 0.49,
} as const;

export const CAFE_TOTAL_RATE = CAFE_RATES.bdr + CAFE_RATES.sdr + CAFE_RATES.rep; // 0.72

// ─── Regras por SKU ────────────────────────────────────────────────────────────

export interface SkuCommissionRule {
  model: CommissionModel;
  /** Gatilho de faturamento nos 30 primeiros dias. `null` = sem mínimo (comodato). */
  gatilho30d: number | null;
  /** Exige tabela de preços cheia para comissionar (Máquina de Café). */
  requiresFullPriceTable?: boolean;
  /** Exige pagamento da 1ª fatura para liberar comissão (comodato). */
  requiresFirstInvoice?: boolean;
  /** Comissão paga em parcelas com teto fixo por parcela, em R$ (comodato). */
  installmentCap?: number;
}

/** Teto padrão por parcela no comodato (regra do cliente). */
export const COMODATO_INSTALLMENT_CAP = 5000;

/**
 * Estágios de "conquista" — negócios ativados, elegíveis a comissão.
 * inaugurado = WizMart / venda direta ; instalacao_realizada = comodato Smart Café.
 */
export const STAGES_CONQUISTA = ['inaugurado', 'instalacao_realizada'];

/** O negócio está em estágio de conquista (elegível a comissão)? */
export function isDealComissionavel(stage?: string): boolean {
  return !!stage && STAGES_CONQUISTA.includes(stage);
}

/**
 * Mapeamento SKU → regra. SKUs sem regra definida pelo cliente ficam de fora
 * (locação e kit alimentação) e devem ser tratados como "regra pendente" na UI.
 */
export const SKU_COMMISSION_RULES: Partial<Record<ProductSKU, SkuCommissionRule>> = {
  wizmart_minimercado:    { model: 'standard', gatilho30d: 3000 },
  smartcafe_snacks:       { model: 'standard', gatilho30d: 2000 },
  smartcafe_venda_direta: { model: 'cafe',     gatilho30d: 1000, requiresFullPriceTable: true },
  smartcafe_comodato:     { model: 'standard', gatilho30d: null, requiresFirstInvoice: true, installmentCap: COMODATO_INSTALLMENT_CAP },
};

export function getSkuRule(sku: ProductSKU): SkuCommissionRule | undefined {
  return SKU_COMMISSION_RULES[sku];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Arredonda para centavos (2 casas), evitando ruído de ponto flutuante. */
export function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** % de comissão do SDR conforme o tier. Ausente → 'junior'. */
export function sdrStandardRate(tier?: CommissionTier): number {
  return STANDARD_RATES.sdr[tier ?? 'junior'];
}

// ─── Projeção (avaliação do dia 10) ─────────────────────────────────────────────

/**
 * Projeta o faturamento de 30 dias a partir do vendido em N dias.
 *   (vendido / dias) * 30
 * Ex.: R$ 1.000 em 10 dias → R$ 3.000.
 */
export function projetarFaturamento(vendido: number, diasDecorridos: number): number {
  if (diasDecorridos <= 0) return 0;
  if (vendido < 0) return 0;
  return roundMoney((vendido / diasDecorridos) * 30);
}

// ─── Avaliação de gatilho ───────────────────────────────────────────────────────

export interface GatilhoInput {
  sku: ProductSKU;
  /** Faturamento usado p/ comparar com o gatilho (real de 30d OU projetado). */
  faturamentoReferencia: number;
  /** Máquina de Café: tabela de preços cheia? */
  tabelaCheia?: boolean;
  /** Comodato: 1ª fatura paga? */
  primeiraFaturaPaga?: boolean;
}

export interface GatilhoResultado {
  atingido: boolean;
  /** Motivo quando NÃO atingido, para exibir ao gerente. */
  motivo?: string;
}

export function avaliarGatilho(input: GatilhoInput): GatilhoResultado {
  const rule = getSkuRule(input.sku);
  if (!rule) {
    return { atingido: false, motivo: 'Regra de comissão ainda não definida para este produto.' };
  }

  // Pré-condições específicas
  if (rule.requiresFullPriceTable && !input.tabelaCheia) {
    return { atingido: false, motivo: 'Tabela de preços não está cheia.' };
  }
  if (rule.requiresFirstInvoice && !input.primeiraFaturaPaga) {
    return { atingido: false, motivo: '1ª fatura ainda não foi paga.' };
  }

  // Gatilho de faturamento (null = sem mínimo)
  if (rule.gatilho30d != null && input.faturamentoReferencia < rule.gatilho30d) {
    return {
      atingido: false,
      motivo: `Faturamento de referência (${input.faturamentoReferencia}) abaixo do gatilho (${rule.gatilho30d}).`,
    };
  }

  return { atingido: true };
}

// ─── Cálculo do rateio ──────────────────────────────────────────────────────────

export interface ComissaoSplit {
  bdr: number;
  sdr: number;
  rep: number;
  total: number;
}

export interface CalcularComissaoInput {
  sku: ProductSKU;
  /** Base de cálculo: faturamento integral (30d) OU valor já vendido (proporcional). */
  base: number;
  /** Tier do SDR vinculado ao card (só usado no modelo padrão). */
  sdrTier?: CommissionTier;
}

/**
 * Calcula o rateio da comissão sobre a `base` informada.
 * Para pagamento PROPORCIONAL (avaliação do dia 10), passe em `base` o valor já
 * vendido — o split sai automaticamente proporcional.
 */
export function calcularComissao(input: CalcularComissaoInput): ComissaoSplit {
  const rule = getSkuRule(input.sku);
  if (!rule) {
    return { bdr: 0, sdr: 0, rep: 0, total: 0 };
  }

  const base = Math.max(0, input.base);

  if (rule.model === 'cafe') {
    const bdr = roundMoney(base * CAFE_RATES.bdr);
    const sdr = roundMoney(base * CAFE_RATES.sdr);
    const rep = roundMoney(base * CAFE_RATES.rep);
    return { bdr, sdr, rep, total: roundMoney(bdr + sdr + rep) };
  }

  // modelo padrão
  const bdr = roundMoney(base * STANDARD_RATES.bdr);
  const sdr = roundMoney(base * sdrStandardRate(input.sdrTier));
  const rep = roundMoney(base * STANDARD_RATES.rep);
  return { bdr, sdr, rep, total: roundMoney(bdr + sdr + rep) };
}

// ─── Parcelamento do comodato (teto por parcela) ────────────────────────────────

export interface Parcela {
  numero: number;
  valor: number;
}

/**
 * Divide um valor de comissão em parcelas com TETO fixo por parcela (regra do
 * cliente para comodato). Gera parcelas cheias no valor do teto e a sobra na
 * última. Ex.: 23.000 com teto 5.000 → [5k, 5k, 5k, 5k, 3k].
 */
export function parcelarPorTeto(valorTotal: number, teto: number = COMODATO_INSTALLMENT_CAP): Parcela[] {
  if (valorTotal <= 0 || teto <= 0) return [];
  const parcelas: Parcela[] = [];
  let restante = roundMoney(valorTotal);
  let numero = 1;
  while (restante > 0) {
    const valor = restante > teto ? teto : restante;
    parcelas.push({ numero, valor: roundMoney(valor) });
    restante = roundMoney(restante - valor);
    numero++;
  }
  return parcelas;
}

/**
 * Divide um valor em N parcelas iguais (sobra de centavos na última).
 * Mantido como utilitário genérico; o comodato usa parcelarPorTeto.
 */
export function parcelarManual(valorTotal: number, numeroParcelas: number): Parcela[] {
  if (numeroParcelas <= 0 || valorTotal <= 0) return [];
  const base = roundMoney(valorTotal / numeroParcelas);
  const parcelas: Parcela[] = [];
  let acumulado = 0;
  for (let i = 1; i < numeroParcelas; i++) {
    parcelas.push({ numero: i, valor: base });
    acumulado = roundMoney(acumulado + base);
  }
  parcelas.push({ numero: numeroParcelas, valor: roundMoney(valorTotal - acumulado) });
  return parcelas;
}

// ─── Elegibilidade / data de pagamento (dia 15) ─────────────────────────────────

/**
 * Dado o dia da ativação (inauguração/instalação), retorna a data do dia 15 em
 * que a comissão é elegível. Cliente ativado até o último dia do mês → dia 15 do
 * mês seguinte. Datas em UTC para evitar deslize de timezone.
 */
export function dataPagamentoDia15(dataAtivacao: Date): Date {
  const ano = dataAtivacao.getUTCFullYear();
  const mes = dataAtivacao.getUTCMonth(); // 0-based
  // Mês seguinte ao da ativação, dia 15.
  return new Date(Date.UTC(ano, mes + 1, 15));
}
