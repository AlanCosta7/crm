/**
 * handoffUtils.ts — Utilitários puros para handoffs e SLA do Representante
 *
 * Todas as funções são puras e totalmente testáveis.
 * Testes em: src/utils/handoffUtils.test.ts
 *
 * Regras de negócio (REQUISITOS-V2.md §7):
 *  - Rep SEMPRE deve ter a próxima atividade agendada
 *  - Prazo máximo entre atividades: 3 dias úteis
 *  - Se fechar sem preencher → atividade "follow-up pendente" automática
 */

import type { Handoff, UserRole } from '../types/crm';

// ── Tipos de atividade do Rep ─────────────────────────────────────────────────

export type RepActivityType = 'email' | 'whatsapp' | 'call' | 'meeting' | 'visit' | 'proposal';

export interface NextActionFormData {
  type: RepActivityType;
  scheduledAt: string; // ISO string
  notes?: string;
}

export interface NextActionValidation {
  valid: boolean;
  errors: Partial<Record<keyof NextActionFormData, string>>;
}

// ── Validação do formulário "Próxima Ação" ────────────────────────────────────

/**
 * Valida o formulário de "Próxima Ação" do Representante.
 *
 * Regras:
 *  - tipo obrigatório
 *  - data obrigatória e no futuro
 *  - data máxima = hoje + 3 dias úteis
 */
export function validateNextActionForm(
  form: Partial<NextActionFormData>,
  maxBusinessDays = 3,
): NextActionValidation {
  const errors: Partial<Record<keyof NextActionFormData, string>> = {};

  if (!form.type) {
    errors.type = 'Selecione o tipo da próxima ação.';
  }

  if (!form.scheduledAt) {
    errors.scheduledAt = 'Informe a data da próxima atividade.';
  } else {
    const date = new Date(form.scheduledAt);
    const now  = new Date();

    if (isNaN(date.getTime())) {
      errors.scheduledAt = 'Data inválida.';
    } else if (date <= now) {
      errors.scheduledAt = 'A data deve ser no futuro.';
    } else {
      // Verifica prazo máximo de N dias úteis
      const maxDate = addBusinessDays(new Date(), maxBusinessDays);
      if (date > maxDate) {
        errors.scheduledAt = `A próxima atividade deve ser em até ${maxBusinessDays} dias úteis.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ── Cálculo de dias úteis ─────────────────────────────────────────────────────

/**
 * Adiciona N dias úteis (seg–sex) a uma data base.
 * @param from Data de início (default: hoje)
 * @param days Número de dias úteis a adicionar
 * @returns Nova data com N dias úteis adicionados
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setHours(23, 59, 0, 0); // fim do dia
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/**
 * Retorna a data máxima permitida para "Próxima Ação" no formato YYYY-MM-DDTHH:mm.
 * Usada como `max` no datepicker.
 */
export function getMaxNextActionDate(maxBusinessDays = 3): string {
  return addBusinessDays(new Date(), maxBusinessDays).toISOString().slice(0, 16);
}

/**
 * Retorna a data sugerida de "Próxima Ação" (hoje + 1 dia útil).
 */
export function getSuggestedNextActionDate(): string {
  return addBusinessDays(new Date(), 1).toISOString().slice(0, 16);
}

// ── Verificação de SLA ────────────────────────────────────────────────────────

/**
 * Verifica se o Rep está violando o SLA de 3 dias úteis sem atividade.
 *
 * @param lastCompletedAt Timestamp da última atividade concluída (ou null se nunca completou)
 * @param now Timestamp atual (injetável para testes)
 * @returns true se o Rep está em violação de SLA
 */
export function isRepOverSla(
  lastCompletedAt: Date | null,
  slaBusinessDays = 3,
  now: Date = new Date(),
): boolean {
  if (!lastCompletedAt) return false; // Rep nunca completou nada — não penaliza ainda

  const deadline = addBusinessDays(lastCompletedAt, slaBusinessDays);
  return now > deadline;
}

/**
 * Calcula quantos dias úteis se passaram desde a última atividade do Rep.
 * @returns Número inteiro. Se negativo, ainda está dentro do prazo.
 */
export function businessDaysSinceLastActivity(
  lastCompletedAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastCompletedAt) return 0;

  const from = new Date(lastCompletedAt);
  from.setHours(0, 0, 0, 0);
  const to   = new Date(now);
  to.setHours(0, 0, 0, 0);

  let count = 0;
  const cursor = new Date(from);

  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ── Status de handoff ─────────────────────────────────────────────────────────

/** Retorna label amigável do status do handoff. */
export function handoffStatusLabel(status: Handoff['status']): string {
  const labels: Record<Handoff['status'], string> = {
    pending_rep_acceptance: 'Aguardando aceite',
    accepted: 'Aceito',
    declined: 'Recusado',
  };
  return labels[status] ?? status;
}

/** Retorna a cor do badge do status do handoff. */
export function handoffStatusColor(status: Handoff['status']): string {
  const colors: Record<Handoff['status'], string> = {
    pending_rep_acceptance: '#F59E0B',
    accepted: '#22C55E',
    declined: '#EF4444',
  };
  return colors[status] ?? '#6B7280';
}

// ── Permissões ────────────────────────────────────────────────────────────────

/** Verifica se o role pode aceitar handoffs. */
export function canAcceptHandoff(role: UserRole): boolean {
  return ['rep', 'master', 'manager'].includes(role);
}

/** Verifica se o role pode criar handoffs. */
export function canCreateHandoff(role: UserRole): boolean {
  return ['sdr', 'master', 'manager'].includes(role);
}

/** Verifica se o role pode ver todos os handoffs (não apenas os seus). */
export function canViewAllHandoffs(role: UserRole): boolean {
  return ['master', 'manager'].includes(role);
}

// ── Configuração de tipos de atividade do Rep ─────────────────────────────────

export const REP_ACTIVITY_CONFIG: Record<RepActivityType, { icon: string; label: string; color: string }> = {
  email:    { icon: 'Mail',          label: 'E-mail',     color: '#1A6B1A' },
  whatsapp: { icon: 'MessageCircle', label: 'WhatsApp',   color: '#25D366' },
  call:     { icon: 'Phone',         label: 'Ligação',    color: '#F59E0B' },
  meeting:  { icon: 'Calendar',      label: 'Reunião',    color: '#0E7490' },
  visit:    { icon: 'MapPin',        label: 'Visita',     color: '#7C3AED' },
  proposal: { icon: 'FileText',      label: 'Proposta',   color: '#B91C1C' },
};

export const REP_ACTIVITY_TYPES: RepActivityType[] = ['email', 'whatsapp', 'call', 'meeting', 'visit', 'proposal'];
