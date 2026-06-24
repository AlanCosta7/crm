/**
 * funnelUtils.ts — Utilitários puros para lógica de funis do WizMart CRM v2
 *
 * Todas as funções são puras (sem efeitos colaterais) e totalmente testáveis.
 * Testes em: src/utils/funnelUtils.test.ts
 *
 * Regras de negócio documentadas em REQUISITOS-V2.md §4 e ADR-006.
 */

import type { Funnel, FunnelStage, FunnelType, Deal, UserRole } from '../types/crm';

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
  priorityChannel: 'email' | 'whatsapp' | 'call';
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
 * Viewers não podem; roles operacionais podem.
 */
export function canMoveDeal(role: UserRole): boolean {
  return role !== 'viewer';
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
