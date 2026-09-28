/**
 * dealTimeline.ts — eventos de `deal_timeline` que entram no Histórico do card
 * (PLANO_DESENHO_CRM_2.md, A5).
 *
 * Word do cliente: "O histórico de solicitação deve ficar registrado na linha do
 * tempo do card". As Cloud Functions já gravavam `project_requested` e
 * `project_delivered`, mas a aba Histórico nunca lia a coleção. Só os eventos de
 * PROJETO entram aqui: os de passagem de bastão já aparecem nos passos que o
 * `renderHistory` deriva do deal e dos handoffs, e mostrá-los de novo duplicaria
 * a linha.
 */

export interface TimelineLink { label: string; url: string }

export interface DealTimelineEvent {
  id?: string;
  type: string;
  message: string;
  createdAt?: any;
  links?: TimelineLink[];
}

export interface TimelineStep {
  icon: string;
  color: string;
  text: string;
  at: Date | null;
  links: TimelineLink[];
}

const PROJECT_STYLE: Record<string, { icon: string; color: string }> = {
  project_requested:   { icon: 'PenLine',      color: '#1A6B1A' },
  project_in_progress: { icon: 'Pencil',       color: '#1D4ED8' },
  project_delivered:   { icon: 'CheckCircle2', color: '#15803D' },
};

function toDate(raw: any): Date | null {
  if (!raw) return null;
  const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function projectTimelineSteps(events: DealTimelineEvent[]): TimelineStep[] {
  return events
    .filter((e) => e.type in PROJECT_STYLE)
    .map((e) => ({
      ...PROJECT_STYLE[e.type],
      text: e.message,
      at: toDate(e.createdAt),
      links: (e.links ?? []).filter((l) => l?.url),
    }))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}
