/**
 * dealActivities.ts — separa as atividades de UM card em "Próximas na
 * Cadência" (o que ainda falta fazer) e "Histórico" (o que já aconteceu).
 *
 * Slide 5 do Desenho CRM: "Como o SDR deve enxergar a cadência" — "Deve
 * enxergar individualmente ao abrir cada Card". Antes desta separação, a aba
 * Atividades do card misturava tudo numa timeline só ordenada por data mais
 * recente primeiro — um agendamento de amanhã podia ficar enterrado abaixo de
 * uma nota de duas semanas atrás, e a aba lia como histórico, não como "o que
 * fazer a seguir" (achado de QA manual, 12/09/2026).
 */
import type { Activity } from '../../types/crm';

function timeValue(raw: any): number {
  if (!raw) return 0;
  if (typeof raw?.toDate === 'function') return raw.toDate().getTime();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

const UPCOMING_STATUSES = new Set(['pending', 'overdue']);

export interface SplitDealActivities {
  /** Ainda não resolvidas — ordenadas da mais próxima para a mais distante. */
  upcoming: Activity[];
  /** Já concluídas, puladas ou remarcadas — mais recente primeiro. */
  history: Activity[];
}

export function splitDealActivities(activities: Activity[], dealId: string): SplitDealActivities {
  const dealActivities = activities.filter((a) => a.dealId === dealId);

  const upcoming = dealActivities
    .filter((a) => UPCOMING_STATUSES.has(a.status))
    .sort((x, y) => timeValue(x.scheduledAt ?? x.dueAt) - timeValue(y.scheduledAt ?? y.dueAt));

  const history = dealActivities
    .filter((a) => !UPCOMING_STATUSES.has(a.status))
    .sort((x, y) =>
      timeValue(y.completedAt ?? y.scheduledAt ?? y.createdAt) - timeValue(x.completedAt ?? x.scheduledAt ?? x.createdAt),
    );

  return { upcoming, history };
}
