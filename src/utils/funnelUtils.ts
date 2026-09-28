/**
 * funnelUtils.ts — Utilitários puros para lógica de funis do WizMart CRM v2
 *
 * Todas as funções são puras (sem efeitos colaterais) e totalmente testáveis.
 * Testes em: src/utils/funnelUtils.test.ts
 *
 * Regras de negócio documentadas em REQUISITOS-V2.md §4 e ADR-006.
 */

import type { Funnel, FunnelStage, FunnelType, Deal, UserRole, ProductId, DealOrigin } from '../types/crm';

// ── Lookup de funis ───────────────────────────────────────────────────────────

/** Retorna o funil pelo ID. Se não encontrado, retorna undefined. */
export function funnelById(funnels: Funnel[], id: string): Funnel | undefined {
  return funnels.find(f => f.id === id);
}

/** Retorna o estágio pelo ID dentro de um funil. Se não encontrado, retorna undefined. */
export function stageInFunnel(funnel: Funnel, stageId: string): FunnelStage | undefined {
  return funnel.stages.find(s => s.id === stageId);
}

/** Retorna os estágios de um funil ordenados por `order` (crescente). */
export function sortedStages(funnel: Funnel): FunnelStage[] {
  return [...funnel.stages].sort((a, b) => a.order - b.order);
}

// ── Regras de convergência ────────────────────────────────────────────────────

/**
 * Verifica se a movimentação de um deal para um estágio deve
 * disparar a criação de um deal espelho no funil Hunter.
 *
 * Condições (ADR-006):
 *  - O deal está em funil Inbound OU Outbound (não pode ser Hunter → Hunter)
 *  - O estágio de destino tem `isConvergencePoint === true`
 *  - O deal ainda não foi convertido (status !== 'converted')
 */
export function shouldTriggerConvergence(
  deal: Deal,
  targetStage: FunnelStage,
  funnelType: FunnelType,
): boolean {
  // v3: funis unificados ('main') não usam convergência — não há funil Hunter separado
  if (funnelType === 'main') return false;
  if (!targetStage.isConvergencePoint) return false;
  if (funnelType === 'hunter') return false;
  if (deal.status === 'converted' || deal.status === 'won' || deal.status === 'lost') return false;
  return true;
}

/**
 * Verifica se a movimentação exige formulário de handoff obrigatório.
 *
 * Condições:
 *  - O estágio de destino tem `isHandoffRequired === true`
 *  - O deal ainda não tem handoff completo
 */
export function shouldRequireHandoff(
  targetStage: FunnelStage,
  deal: Deal,
): boolean {
  if (!targetStage.isHandoffRequired) return false;
  if (deal.handoffStatus === 'completed' || deal.handoffStatus === 'accepted') return false;
  return true;
}

// ── Validação do formulário de handoff ───────────────────────────────────────

export interface HandoffFormData {
  priorityChannel: 'email' | 'whatsapp' | 'call' | 'linkedin';
  visitType: 'presential' | 'video';
  visitScheduledAt: string; // ISO string
  toRepId: string;
  notes: string;
}

export interface HandoffValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof HandoffFormData, string>>;
}

/**
 * Valida o formulário de passagem de bastão.
 * Retorna { valid: true } se todos os campos obrigatórios estão preenchidos.
 */
export function validateHandoffForm(form: Partial<HandoffFormData>): HandoffValidationResult {
  const errors: Partial<Record<keyof HandoffFormData, string>> = {};

  if (!form.priorityChannel) {
    errors.priorityChannel = 'Selecione o canal prioritário.';
  }
  if (!form.visitType) {
    errors.visitType = 'Selecione o tipo de visita.';
  }
  if (!form.visitScheduledAt) {
    errors.visitScheduledAt = 'Informe a data e hora da visita.';
  } else {
    const date = new Date(form.visitScheduledAt);
    if (isNaN(date.getTime())) {
      errors.visitScheduledAt = 'Data inválida.';
    } else if (date < new Date()) {
      errors.visitScheduledAt = 'A data da visita deve ser no futuro.';
    }
  }
  if (!form.toRepId) {
    errors.toRepId = 'Selecione o representante responsável.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ── SLA e alertas ─────────────────────────────────────────────────────────────

/**
 * Verifica se um deal ultrapassou o SLA configurado no estágio.
 *
 * @param deal - O deal a verificar
 * @param stage - O estágio atual do deal
 * @param nowMs - Timestamp atual em ms (injetável para testes)
 * @returns true se o deal está além do SLA
 */
export function isDealOverSla(
  deal: Deal,
  stage: FunnelStage,
  nowMs: number = Date.now(),
): boolean {
  if (!stage.slaBusinessDays || stage.slaBusinessDays <= 0) return false;

  // Usa updatedAt como referência de quando entrou no estágio
  const enteredAt: number = deal.updatedAt?.toDate
    ? deal.updatedAt.toDate().getTime()
    : typeof deal.updatedAt === 'number'
      ? deal.updatedAt
      : 0;

  if (!enteredAt) return false;

  const elapsed = nowMs - enteredAt;
  const elapsedDays = elapsed / (1000 * 60 * 60 * 24);

  // Aproximação: dias úteis ≈ dias corridos × 5/7
  const elapsedBusinessDays = elapsedDays * (5 / 7);

  return elapsedBusinessDays > stage.slaBusinessDays;
}

// ── Permissões de pipeline por role ──────────────────────────────────────────

/**
 * Retorna os tipos de funil que um role pode ver.
 * v3: funis unificados usam type 'main' — todos os roles veem 'main'.
 * Tipos legados (inbound/outbound/hunter) mantidos para compatibilidade.
 */
export function visibleFunnelTypes(role: UserRole): FunnelType[] {
  switch (role) {
    case 'bdr':     return ['main', 'inbound', 'outbound'];
    case 'sdr':     return ['main', 'inbound', 'outbound'];
    case 'rep':     return ['main', 'hunter'];
    case 'master':
    case 'manager': return ['main', 'inbound', 'outbound', 'hunter'];
    default:        return ['main', 'inbound', 'outbound', 'hunter'];
  }
}

/**
 * Verifica se um role pode mover deals no Kanban (drag-and-drop).
 * Viewers e design não podem (as security rules de deals só permitem
 * update para papéis operacionais); os demais podem.
 */
export function canMoveDeal(role: UserRole): boolean {
  return role !== 'viewer' && role !== 'design';
}

/**
 * Verifica se um role pode confirmar a passagem de bastão (handoff SDR → Rep).
 * Espelha a security rule de `handoffs.create` (isSdr): apenas SDR e gestão.
 * BDR passa leads para o SDR (não para o Rep) e por isso não faz handoff.
 */
export function canConfirmHandoff(role: UserRole): boolean {
  return role === 'sdr' || role === 'manager' || role === 'master';
}

// ── Substituição de variáveis nos templates ───────────────────────────────────

export interface TemplateVars {
  contactFirstName?: string;
  contactLastName?: string;
  companyName?: string;
  productName?: string;
  userName?: string;
  visitDate?: string;
  visitTime?: string;
  visitLocation?: string;
}

/**
 * Substitui variáveis `{{nome}}` no corpo de um template de playbook.
 * Variáveis não encontradas em `vars` são mantidas sem alteração.
 *
 * @example
 * applyTemplate("Olá {{contactFirstName}}!", { contactFirstName: "João" })
 * // → "Olá João!"
 */
export function applyTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key as keyof TemplateVars];
    return value !== undefined ? value : match;
  });
}

// ── Boards do Pipeline — visão única por produto (Fase 1.3) ───────────────────

/**
 * O deck "Desenho CRM" (slide 1) pede uma visão ÚNICA do pipe: "Sem distinção
 * entre Inbound e Outbound". Até aqui o Pipeline montava uma aba por funil, o
 * que produzia quatro boards para o mesmo produto (`BDR - Outbound`,
 * `Inbound — WizMart`, `Outbound — WizMart`, `WizMart`) — a separação era
 * estrutural, não uma preferência de visualização.
 *
 * `pipelineBoards` resolve isso escolhendo UM board por produto:
 *  - se o produto tem funil unificado (`type: 'main'`), ele é o board, e os
 *    funis legados do mesmo produto deixam de virar aba;
 *  - se não tem (tenant que nunca rodou o `sync-main-funnels-prod`), cai nos
 *    funis legados como antes — a migração não pode escurecer o pipe de quem
 *    ainda não migrou.
 *
 * A origem do lead não desaparece: virou `Deal.origin`, exibida no card e
 * filtrável (`filterDealsByOrigin`).
 */
export function pipelineBoards(
  funnels: Funnel[],
  role: UserRole,
  matchesProduct: (productId: ProductId | undefined) => boolean,
): Funnel[] {
  const allowedTypes = visibleFunnelTypes(role);
  const visible = funnels
    .filter(f => f.isActive && allowedTypes.includes(f.type))
    .filter(f => matchesProduct(f.productId));

  const mainByProduct = new Map<string, Funnel>();
  for (const f of visible) {
    if (f.type === 'main') mainByProduct.set(f.productId ?? 'wizmart', f);
  }

  // Produto com funil unificado: só ele vira aba. Sem funil unificado: mantém
  // os legados, para o pipe não ficar vazio em tenant não migrado.
  const boards = visible.filter(f =>
    f.type === 'main' || !mainByProduct.has(f.productId ?? 'wizmart'),
  );

  // Ordem estável: produto unificado primeiro, depois legados, cada grupo por nome.
  return boards.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'main' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * O deal pertence a este board?
 *
 * Board unificado casa por PRODUTO, não por `funnelId` — é o que faz um deal
 * preso num funil legado (`Inbound — WizMart`) aparecer no board único do
 * WizMart sem precisar migrar o documento primeiro. Board legado continua
 * casando por `funnelId`, senão dois boards legados do mesmo produto
 * mostrariam os mesmos cards.
 */
export function dealBelongsToBoard(deal: Deal, board: Funnel | undefined): boolean {
  if (!board) return true;
  if (board.type === 'main') {
    return (deal.productId ?? 'wizmart') === (board.productId ?? 'wizmart');
  }
  return deal.funnelId === board.id;
}

/** Origem do deal com o default de leitura: ausente = 'outbound' (igual ao servidor). */
export function dealOrigin(deal: Deal): DealOrigin {
  return deal.origin === 'inbound' ? 'inbound' : 'outbound';
}

/** Filtro de origem do Pipeline. 'all' não filtra nada. */
export function filterDealsByOrigin(deals: Deal[], filter: 'all' | DealOrigin): Deal[] {
  if (filter === 'all') return deals;
  return deals.filter(d => dealOrigin(d) === filter);
}

/** Contagem por origem — alimenta a quebra "1 Inbound / 2 Outbound" do slide 2. */
export function countByOrigin(deals: Deal[]): { inbound: number; outbound: number; total: number } {
  let inbound = 0;
  for (const d of deals) if (dealOrigin(d) === 'inbound') inbound++;
  return { inbound, outbound: deals.length - inbound, total: deals.length };
}
