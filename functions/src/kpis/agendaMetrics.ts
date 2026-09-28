/**
 * agendaMetrics.ts — Reuniões e Visitas Agendadas dos snapshots de KPI
 *
 * Extraído de `kpiAggregator.ts` no mesmo espírito de `userClaimsRules.ts`: o
 * agregador cuida de I/O e este módulo responde "quantas reuniões e visitas
 * agendadas, e de que origem", testável sem emulador.
 *
 * Por que existe: o `meetingsScheduled` por SDR contava DEALS atribuídos ao SDR
 * criados no mês — nada a ver com reunião — e o `visitsScheduled` contava deals
 * com `visitScheduledAt` no mês, o que deixava de fora toda degustação do Smart
 * Café (etapa sem handoff, logo sem essa data) e contava card que já tinha saído
 * da etapa. O snapshot `role: "all"` não tinha nenhum dos dois.
 *
 * As definições são as MESMAS do `DashboardPage` e do `tvHelper`, de propósito:
 * o painel do SDR compara o próprio número (calculado no cliente) com o do time
 * (lido daqui), e as rules não deixam o SDR ler os deals alheios para fazer a
 * conta. Definição divergente = comparação que mente.
 *
 *  - Reunião = ATIVIDADE `type: 'meeting'` criada no período. Atividade não tem
 *    origem: resolve por `dealId` → deal; sem deal, conta em `unresolved`.
 *  - Visita = DEAL hoje numa etapa de visita. É ESTOQUE, não fluxo: conta onde
 *    o card está na hora da execução, não quando entrou na etapa. No snapshot
 *    mensal, o mês fechado fica com o valor da última execução horária dele.
 */

import { computeOrigin } from "../deals/dealOrigin";

/** Etapas que contam como visita agendada. WizMart: visita | Smart Café: degustação. */
export const VISIT_STAGES: ReadonlySet<string> = new Set([
  "visita_agendada",
  "degustacao_agendada",
  "degustacao_realizada",
]);

export interface AgendaDeal {
  id: string;
  stage?: unknown;
  assignedSdrId?: unknown;
  uf?: unknown;
  location?: { state?: unknown } | null;
  leadOrigin?: unknown;
  funnelType?: unknown;
}

export interface AgendaActivity {
  type?: unknown;
  userId?: unknown;
  dealId?: unknown;
  createdAt?: unknown;
}

export interface OriginCount {
  inbound: number;
  outbound: number;
  total: number;
}

export interface MeetingOriginCount extends OriginCount {
  /** Reuniões cujo deal não foi encontrado — não entram em inbound/outbound. */
  unresolved: number;
}

export interface AgendaMetrics {
  meetingsScheduled: number;
  meetingsByOrigin: MeetingOriginCount;
  visitsScheduled: number;
  visitsByOrigin: OriginCount;
}

export interface AgendaInput {
  /** Deals já filtrados pelo produto do snapshot. */
  deals: AgendaDeal[];
  /** Atividades já filtradas pelo produto do snapshot. */
  activities: AgendaActivity[];
  /**
   * Índice de TODOS os deals do tenant, sem filtro de produto: uma reunião pode
   * apontar para deal de outro produto, e é melhor classificá-la certo do que
   * jogá-la em "sem origem" (mesma escolha do dashboard).
   */
  dealsById: Map<string, AgendaDeal>;
  /** Início do período: só reuniões criadas a partir daqui contam. */
  since: Date;
  /** Recorte por SDR. Ausente = tenant inteiro (snapshot `role: "all"`), como no dashboard da gestão. */
  sdrId?: string;
}

/**
 * Reunião agendada — a mesma regra do DashboardPage e do tvHelper.
 *
 * Limitação conhecida, que vale igual nos três lugares: a régua de agenda
 * (`applyAgendaRuler`) grava follow-ups e confirmação como `type: 'meeting'`
 * (`cadenceType: 'agenda'`), e mover o card para `reuniao_agendada` não cria
 * atividade de reunião. Não é corrigido só aqui porque o snapshot existe para
 * ser comparado com o dashboard — a definição muda nos três lugares juntos.
 */
export function isMeetingActivity(a: AgendaActivity): boolean {
  return a.type === "meeting";
}

export function isVisitDeal(d: AgendaDeal): boolean {
  return typeof d.stage === "string" && VISIT_STAGES.has(d.stage);
}

export function indexDealsById<T extends { id: string }>(deals: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const d of deals) if (d.id) map.set(d.id, d);
  return map;
}

/** Timestamp do Firestore (`toDate`) ou Date. Qualquer outra coisa não é datável. */
function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate(): Date }).toDate();
  }
  return null;
}

/**
 * Origem via `computeOrigin`, e não pelo `origin` gravado no deal — igual ao
 * tvHelper: não depende do backfill e é a mesma regra que grava o campo.
 */
export function computeAgendaMetrics(input: AgendaInput): AgendaMetrics {
  const { deals, activities, dealsById, since, sdrId } = input;

  const meetings = activities.filter(a => {
    if (!isMeetingActivity(a)) return false;
    if (sdrId !== undefined && a.userId !== sdrId) return false;
    const created = asDate(a.createdAt);
    return created !== null && created >= since;
  });

  const meetingsByOrigin: MeetingOriginCount = { inbound: 0, outbound: 0, unresolved: 0, total: meetings.length };
  for (const a of meetings) {
    const deal = typeof a.dealId === "string" ? dealsById.get(a.dealId) : undefined;
    if (!deal) { meetingsByOrigin.unresolved++; continue; }
    meetingsByOrigin[computeOrigin(deal)]++;
  }

  const visits = deals.filter(d => isVisitDeal(d) && (sdrId === undefined || d.assignedSdrId === sdrId));
  const visitsByOrigin: OriginCount = { inbound: 0, outbound: 0, total: visits.length };
  for (const d of visits) visitsByOrigin[computeOrigin(d)]++;

  return {
    meetingsScheduled: meetings.length,
    meetingsByOrigin,
    visitsScheduled: visits.length,
    visitsByOrigin,
  };
}

/**
 * Visitas por UF — mesma população de `visitsScheduled`, para o mapa e o total
 * sempre somarem igual. Deal sem UF vai para "Sem UF" em vez de sumir.
 */
export function countVisitsByState(deals: AgendaDeal[]): Record<string, number> {
  const porUf: Record<string, number> = {};
  for (const d of deals) {
    if (!isVisitDeal(d)) continue;
    const uf = (typeof d.uf === "string" && d.uf)
      || (typeof d.location?.state === "string" && d.location.state)
      || "Sem UF";
    porUf[uf] = (porUf[uf] ?? 0) + 1;
  }
  return porUf;
}
