/**
 * cardExpirationUtils.ts — Vencimento do card por inatividade
 *
 * Pedido do cliente (Observações CRM, jul/2026): "Gatilho para vencimento do
 * card: sequência de atividades realizadas." Resposta do cliente: "O Card
 * vence após 3 semanas sem atividade." — ou seja, o vencimento é por
 * INATIVIDADE (nenhuma atividade concluída no lead), não pela conclusão da
 * sequência de follow-ups da cadência.
 *
 * Escopo: só se aplica a leads ativos com um SDR responsável, ainda não
 * repassados ao Representante (handoff muda o dono e o SLA aplicável).
 */

export const CARD_EXPIRATION_DAYS = 21; // 3 semanas

function toDate(raw: any): Date | null {
  if (!raw) return null;
  const d = raw?.toDate ? raw.toDate() : raw instanceof Date ? raw : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Retorna o momento da última atividade CONCLUÍDA de um deal específico
 * (a base para medir inatividade), ou null se nenhuma atividade concluída existe.
 */
export function getLastActivityAt(
  activities: Array<{ dealId?: string; status?: string; completedAt?: any; createdAt?: any }>,
  dealId: string,
): Date | null {
  let latest: Date | null = null;
  for (const a of activities) {
    if (a.dealId !== dealId || a.status !== 'completed') continue;
    const d = toDate(a.completedAt ?? a.createdAt);
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  return latest;
}

export interface ExpirableDeal {
  status?: string;
  assignedSdrId?: string;
  assignedRepId?: string;
  handoffStatus?: string;
  assignedAt?: any;
  createdAt?: any;
}

/**
 * Verifica se o card está vencido: lead aberto, com SDR responsável, ainda
 * sem handoff, e sem nenhuma atividade concluída há >= 21 dias (contados da
 * última atividade concluída, ou da atribuição/criação se nunca houve uma).
 */
export function isCardExpired(
  deal: ExpirableDeal,
  lastActivityAt: Date | null,
  nowMs: number = Date.now(),
): boolean {
  if (deal.status !== 'open') return false;
  if (!deal.assignedSdrId) return false;
  if (deal.assignedRepId || deal.handoffStatus) return false; // já passou para o Rep

  const anchor = lastActivityAt ?? toDate(deal.assignedAt) ?? toDate(deal.createdAt);
  if (!anchor) return false;

  const days = (nowMs - anchor.getTime()) / 86_400_000;
  return days >= CARD_EXPIRATION_DAYS;
}

/** Dias corridos desde a última atividade (ou atribuição/criação) — para exibir "vencido há N dias". */
export function daysSinceLastActivity(
  deal: ExpirableDeal,
  lastActivityAt: Date | null,
  nowMs: number = Date.now(),
): number | null {
  const anchor = lastActivityAt ?? toDate(deal.assignedAt) ?? toDate(deal.createdAt);
  if (!anchor) return null;
  return Math.floor((nowMs - anchor.getTime()) / 86_400_000);
}
