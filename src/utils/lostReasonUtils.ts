/**
 * lostReasonUtils.ts — Taxonomia estruturada de motivos de perda
 *
 * Pedido do cliente (Observações CRM, jul/2026): ao marcar um negócio como
 * "Perdeu", o SDR escolhe um motivo entre uma lista fechada. Dois motivos
 * ("Fechou com concorrente" e "Não tem interesse no momento") devolvem o
 * lead diretamente ao BDR para uma nova tentativa de prospecção no futuro
 * — o BDR decide quando reativar (botão dedicado no painel do BDR).
 */
import type { LostReasonId } from '../types/crm';

export interface LostReasonDef {
  id: LostReasonId;
  label: string;
  /** true = devolve o lead ao BDR (requeuedForBdr) em vez de só arquivar */
  requeueToBdr: boolean;
}

export const LOST_REASONS: LostReasonDef[] = [
  { id: 'valor_alto',            label: 'Achou nosso valor alto',                    requeueToBdr: false },
  { id: 'quer_fornecedor',       label: 'Deseja se tornar um fornecedor',            requeueToBdr: false },
  { id: 'quer_franqueado',       label: 'Deseja se tornar um franqueado',            requeueToBdr: false },
  { id: 'fechou_concorrente',    label: 'Fechou com concorrente',                    requeueToBdr: true  },
  { id: 'fora_perfil_evento',    label: 'Fora do Perfil - Evento',                   requeueToBdr: false },
  { id: 'fora_perfil_area',      label: 'Fora do Perfil - Fora da área de Atuação',  requeueToBdr: false },
  { id: 'duplicado_outro_sdr',   label: 'Lead com outro SDR (Duplicado)',            requeueToBdr: false },
  { id: 'duplicado',             label: 'Lead Duplicado',                           requeueToBdr: false },
  { id: 'sem_interesse_momento', label: 'Não tem interesse no momento',              requeueToBdr: true  },
  { id: 'repassado_wiz',         label: 'Repassado para Equipe WIZ',                 requeueToBdr: false },
  { id: 'repassado_smart',       label: 'Repassado para Equipe Smart',               requeueToBdr: false },
  { id: 'sem_contato',           label: 'Sem contato com o Lead',                    requeueToBdr: false },
];

export function getLostReasonLabel(id?: LostReasonId | string): string {
  return LOST_REASONS.find(r => r.id === id)?.label ?? '—';
}

export function requeuesToBdr(id: LostReasonId | string): boolean {
  return LOST_REASONS.find(r => r.id === id)?.requeueToBdr ?? false;
}

export function isValidLostReason(id: unknown): id is LostReasonId {
  return typeof id === 'string' && LOST_REASONS.some(r => r.id === id);
}
