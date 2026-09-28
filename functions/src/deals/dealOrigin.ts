/**
 * dealOrigin.ts — de onde o lead veio: Inbound ou Outbound
 *
 * Fase 1.3 do PLANO_DESENHO_CRM.md (raiz do repo `CRM/`).
 *
 * O deck "Desenho CRM" (slide 1) pede uma visão ÚNICA do pipe, sem separar
 * Inbound e Outbound em boards diferentes — mas com a origem visível no card e
 * quebrada nos relatórios ("3 visitas — 1 Inbound / 2 Outbound", slide 2).
 * Para isso a origem precisa ser ATRIBUTO DO DEAL, não o funil em que ele mora.
 *
 * Como se decide (em ordem de confiança):
 *  1. `leadOrigin` presente → `inbound`. É o mais forte: só o endpoint público
 *     `captureLead` grava esse objeto, e ele significa literalmente "o cliente
 *     preencheu um formulário nosso".
 *  2. `funnelType` 'inbound'/'outbound' → respeita. É o sinal dos funis legados,
 *     de quando a origem era estrutural.
 *  3. Qualquer outro caso → `outbound`. Lead que ninguém levantou a mão para
 *     criar foi prospectado por alguém do time; é o default correto para cards
 *     criados à mão por BDR e SDR.
 *
 * A decisão NÃO olha o `origin` já gravado no documento — de propósito. Se
 * olhasse, um cliente criando um deal com `origin: 'inbound'` no payload teria
 * a mentira preservada pela própria função (a rule bloqueia a reescrita em
 * update, mas não o valor inicial no create). Derivando sempre dos sinais
 * confiáveis, a função é determinística e se autocorrige: um valor forjado é
 * sobrescrito na primeira execução do trigger.
 *
 * O campo é ESCRITO SÓ PELO SERVIDOR (`firestore.rules` bloqueia a reescrita
 * pelo cliente): origem é base de relatório e de comissão.
 */

export type DealOrigin = "inbound" | "outbound";

export function computeOrigin(data: {
  leadOrigin?: unknown;
  funnelType?: unknown;
}): DealOrigin {
  // 1. Veio de formulário público — o sinal mais confiável que existe.
  if (data.leadOrigin && typeof data.leadOrigin === "object") return "inbound";

  // 2. Funis legados carregavam a origem no próprio tipo.
  if (data.funnelType === "inbound") return "inbound";
  if (data.funnelType === "outbound") return "outbound";

  // 3. Card criado à mão por alguém do time = prospecção ativa.
  return "outbound";
}

/** Rótulo curto para exibição, igual ao usado no deck. */
export function originLabel(origin: DealOrigin): string {
  return origin === "inbound" ? "Inbound" : "Outbound";
}
