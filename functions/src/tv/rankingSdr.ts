/**
 * rankingSdr.ts — Ranking de SDRs para a TV (PLANO_DESENHO_CRM_2.md, Fase B)
 *
 * Pedido do cliente (deck "Ranking do Time de SDRs"): por SDR, atividades
 * programadas x realizadas, reuniões agendadas, reuniões realizadas e visitas
 * agendadas — com as VISITAS AGENDADAS como peso do pódio.
 *
 * Decisões do cliente (25/09/2026):
 *  - "Reunião realizada" = o card PASSOU para a etapa Reunião Realizada.
 *  - "Visita agendada" = agendadas NO PERÍODO (fluxo, não estoque de cards).
 *  - O período tem filtro na TV: dia, semana e mês — por isso o resultado traz
 *    os três de uma vez, e a TV só escolhe qual exibir.
 *  - O nó da TV é PÚBLICO: só primeiro nome, iniciais e contagens. Nunca uid,
 *    e-mail ou valor financeiro.
 *
 * Puro, sem I/O: o `tvHelper` busca os dados e chama aqui.
 */
import { DEFAULT_SDR_RANKING_WEIGHTS } from "../shared/gamificationSettings";

export type RankingPeriod = "day" | "week" | "month";
export const RANKING_PERIODS: RankingPeriod[] = ["day", "week", "month"];

export type SdrEventKind = "meeting_scheduled" | "meeting_done" | "visit_scheduled";

export interface SdrUser {
  id: string;
  name?: string;
  role?: string;
  isActive?: boolean;
  color?: string;
  initials?: string;
  productIds?: string[];
}

export interface SdrEvent {
  sdrId: string;
  kind: SdrEventKind;
  at: Date;
  productId?: string;
}

export interface SdrActivity {
  userId: string;
  type?: string;
  status?: string;
  createdAt: Date;
  productId?: string;
}

/** Uma linha do ranking — exatamente o que vai para o nó público. */
export interface RankingRow {
  name: string;
  initials: string;
  color: string;
  actDone: number;
  actTotal: number;
  /** 0–100 */
  actPct: number;
  meetingsScheduled: number;
  meetingsDone: number;
  visits: number;
}

export type SdrRanking = Record<RankingPeriod, RankingRow[]>;

const BRT_OFFSET_HOURS = 3;

/**
 * Início de cada período em horário de Brasília, como instante UTC.
 * Semana começa na segunda-feira. (Brasil sem horário de verão desde 2019 — o
 * offset fixo vale o ano todo, mesma premissa do motor de cadência.)
 */
export function periodStartsBRT(now: Date): Record<RankingPeriod, Date> {
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 3600_000);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  const sinceMonday = (brt.getUTCDay() + 6) % 7;
  return {
    day: new Date(Date.UTC(y, m, d, BRT_OFFSET_HOURS)),
    week: new Date(Date.UTC(y, m, d - sinceMonday, BRT_OFFSET_HOURS)),
    month: new Date(Date.UTC(y, m, 1, BRT_OFFSET_HOURS)),
  };
}

export function firstName(name?: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "SDR";
}

function initialsOf(user: SdrUser): string {
  if (user.initials) return user.initials.slice(0, 2).toUpperCase();
  const parts = (user.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const inProduct = (productId: string, itemProduct?: string) =>
  productId === "all" || !itemProduct || itemProduct === productId;

export interface SdrRankingWeights {
  visits: number;
  meetingsDone: number;
  actPct: number;
}

export function buildSdrRanking(input: {
  users: SdrUser[];
  events: SdrEvent[];
  activities: SdrActivity[];
  productId: string;
  now: Date;
  /** Pesos da fórmula de pontuação do pódio (PLANO_DESENHO_CRM_2.md —
   *  pontuação configurável). Em produção, o chamador (`tvHelper`) resolve o
   *  documento configurado via `effectiveSdrRankingWeights` antes de chamar —
   *  este módulo é puro, sem I/O. Omitido, cai no mesmo padrão. */
  weights?: SdrRankingWeights;
}): SdrRanking {
  const { users, events, activities, productId, now, weights = DEFAULT_SDR_RANKING_WEIGHTS } = input;
  const starts = periodStartsBRT(now);

  const sdrs = users.filter(
    (u) =>
      u.role === "sdr" &&
      u.isActive !== false &&
      (productId === "all" || (u.productIds ?? []).includes(productId)),
  );

  const result = {} as SdrRanking;

  for (const period of RANKING_PERIODS) {
    const from = starts[period].getTime();

    const rows: RankingRow[] = sdrs.map((u) => {
      const evs = events.filter(
        (e) => e.sdrId === u.id && e.at.getTime() >= from && inProduct(productId, e.productId),
      );
      const acts = activities.filter(
        (a) =>
          a.userId === u.id &&
          a.createdAt.getTime() >= from &&
          a.type !== "note" &&
          a.status !== "skipped" &&
          inProduct(productId, a.productId),
      );
      const actTotal = acts.length;
      const actDone = acts.filter((a) => a.status === "completed").length;
      return {
        name: firstName(u.name),
        initials: initialsOf(u),
        color: u.color || "#1A6B1A",
        actDone,
        actTotal,
        actPct: actTotal > 0 ? Math.round((actDone / actTotal) * 100) : 0,
        meetingsScheduled: evs.filter((e) => e.kind === "meeting_scheduled").length,
        meetingsDone: evs.filter((e) => e.kind === "meeting_done").length,
        visits: evs.filter((e) => e.kind === "visit_scheduled").length,
      };
    });

    // Pontuação do pódio: soma ponderada (PLANO_DESENHO_CRM_2.md — pontuação
    // configurável). Com os pesos padrão (visits >> meetingsDone >> actPct),
    // isso reproduz a ordem original — visitas agendadas decide, reuniões
    // realizadas desempata, % de atividades desempata o desempate. O master
    // pode reequilibrar os pesos; ordem alfabética é sempre o último critério,
    // pra posição não "pular" entre atualizações da TV quando tudo empata.
    const score = (r: RankingRow) => r.visits * weights.visits + r.meetingsDone * weights.meetingsDone + r.actPct * weights.actPct;
    rows.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "pt-BR"));
    result[period] = rows;
  }

  return result;
}
