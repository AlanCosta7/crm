/**
 * originBreakdown.ts — quebra Inbound/Outbound dos indicadores de agenda
 *
 * Fase 4 do PLANO_DESENHO_CRM.md. O deck (slide 2) pede que Reuniões e Visitas
 * Agendadas mostrem a origem no hover ("3 Reuniões — 0 Inbound / 3 Outbound") e
 * o detalhe no clique (população, cidade e SDR que agendou).
 *
 * A parte que não é óbvia: **visita e reunião não vêm da mesma fonte**.
 *  - Visita é lida do DEAL (estágio `visita_agendada`/`degustacao_*`), e deal
 *    tem `origin` — quebra direta.
 *  - Reunião é lida da ATIVIDADE (`type: 'meeting'`), e atividade NÃO tem
 *    origem. Precisa resolver `activity.dealId` → deal → `origin`.
 *
 * Daí a existência de `unresolved` em `MeetingBreakdown`: uma reunião cujo deal
 * não está no conjunto carregado (deal fora do escopo de produto, deal apagado,
 * atividade legada sem `dealId`) não pode ser classificada. Contá-la como
 * Outbound seria inventar um dado — o número aparece à parte, e a UI diz
 * "N sem origem" em vez de mentir na quebra.
 */

import type { Deal, DealOrigin, ActivityFeedItem } from '../types/crm';
import { dealOrigin } from './funnelUtils';

export interface OriginBreakdown {
  inbound: number;
  outbound: number;
  total: number;
}

export interface MeetingBreakdown extends OriginBreakdown {
  /** Reuniões cujo deal não foi encontrado — não entram em inbound/outbound. */
  unresolved: number;
}

/** Índice dealId → deal, para resolver as atividades sem varrer a lista. */
export function indexDealsById(deals: Deal[]): Map<string, Deal> {
  const map = new Map<string, Deal>();
  for (const d of deals) if (d.id) map.set(d.id, d);
  return map;
}

/** Quebra de uma lista de deals (visitas). `total` é o tamanho da lista. */
export function breakdownDeals(deals: Deal[]): OriginBreakdown {
  let inbound = 0;
  for (const d of deals) if (dealOrigin(d) === 'inbound') inbound++;
  return { inbound, outbound: deals.length - inbound, total: deals.length };
}

/**
 * Quebra de atividades de reunião, resolvendo a origem pelo deal.
 *
 * `total` conta TODAS as reuniões (é o número grande do widget, que não pode
 * mudar por causa desta feature); `inbound + outbound + unresolved === total`.
 */
export function breakdownMeetings(
  meetings: ActivityFeedItem[],
  dealsById: Map<string, Deal>,
): MeetingBreakdown {
  let inbound = 0;
  let outbound = 0;
  let unresolved = 0;

  for (const a of meetings) {
    const dealId = (a as { dealId?: string }).dealId;
    const deal = dealId ? dealsById.get(dealId) : undefined;
    if (!deal) { unresolved++; continue; }
    if (dealOrigin(deal) === 'inbound') inbound++;
    else outbound++;
  }

  return { inbound, outbound, unresolved, total: meetings.length };
}

/** Texto do hover, no formato do slide 2. */
export function breakdownLabel(b: OriginBreakdown | MeetingBreakdown): string {
  const semOrigem = 'unresolved' in b && b.unresolved > 0 ? ` / ${b.unresolved} sem origem` : '';
  return `${b.inbound} Inbound / ${b.outbound} Outbound${semOrigem}`;
}

// ── Detalhe do clique ─────────────────────────────────────────────────────────

/**
 * Uma linha do painel de detalhe. Serve tanto para visita (que nasce de um
 * deal) quanto para reunião (que nasce de uma atividade), justamente para as
 * duas usarem o MESMO painel — o deck pede o mesmo detalhe nos dois casos.
 */
export interface AgendaRow {
  key: string;
  company: string;
  city: string;
  state: string;
  /** `visitPopulation` do deal — o "população" que o slide 2 pede. */
  population?: number;
  /** Quem agendou. Vazio quando não há responsável identificável. */
  scheduledBy: string;
  origin: DealOrigin | null;
}

function localizacao(deal: Deal): { city: string; state: string } {
  const state = (deal as { uf?: string }).uf ?? deal.location?.state ?? '';
  return { city: deal.location?.city ?? '', state };
}

/** Linhas de detalhe das visitas (fonte: deals). */
export function agendaRowsFromDeals(
  deals: Deal[],
  nameOf: (uid: string | undefined) => string,
): AgendaRow[] {
  return deals.map(d => ({
    key: d.id,
    company: d.company || d.name || '—',
    ...localizacao(d),
    population: d.visitPopulation,
    scheduledBy: nameOf(d.assignedSdrId || d.assignedRepId || d.owner),
    origin: dealOrigin(d),
  }));
}

/**
 * Linhas de detalhe das reuniões (fonte: atividades).
 *
 * Empresa, cidade e população vêm do deal quando ele é encontrado; quando não,
 * a linha aparece com `origin: null` e o que a atividade souber dizer. Some
 * silenciosamente seria pior: o total do widget deixaria de bater com a lista.
 */
export function agendaRowsFromMeetings(
  meetings: ActivityFeedItem[],
  dealsById: Map<string, Deal>,
  nameOf: (uid: string | undefined) => string,
): AgendaRow[] {
  return meetings.map((a, i) => {
    const act = a as { id?: string; dealId?: string; userId?: string; companyName?: string };
    const deal = act.dealId ? dealsById.get(act.dealId) : undefined;
    const loc = deal ? localizacao(deal) : { city: '', state: '' };
    return {
      key: act.id ?? `meeting-${i}`,
      company: deal?.company || act.companyName || '—',
      ...loc,
      population: deal?.visitPopulation,
      scheduledBy: nameOf(act.userId),
      origin: deal ? dealOrigin(deal) : null,
    };
  });
}

/** Aplica o filtro de origem às linhas do painel. `null` (sem origem) só aparece em 'all'. */
export function filterAgendaRows(rows: AgendaRow[], filter: 'all' | DealOrigin): AgendaRow[] {
  if (filter === 'all') return rows;
  return rows.filter(r => r.origin === filter);
}
