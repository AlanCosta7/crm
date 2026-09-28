import { describe, it, expect } from "vitest";
import {
  computeAgendaMetrics,
  countVisitsByState,
  indexDealsById,
  isMeetingActivity,
  type AgendaActivity,
  type AgendaDeal,
} from "./agendaMetrics";

const SINCE = new Date(2026, 8, 1); // 01/09/2026
const NO_MES = { toDate: () => new Date(2026, 8, 10) };
const MES_PASSADO = { toDate: () => new Date(2026, 7, 31, 23, 59) };

const deal = (id: string, campos: Record<string, unknown> = {}) => ({ id, ...campos }) as AgendaDeal;

const reuniao = (campos: Record<string, unknown> = {}) =>
  ({ type: "meeting", userId: "sdr1", createdAt: NO_MES, ...campos }) as AgendaActivity;

function metricas(
  deals: AgendaDeal[],
  activities: AgendaActivity[],
  opts: { sdrId?: string; todosOsDeals?: AgendaDeal[] } = {},
) {
  return computeAgendaMetrics({
    deals,
    activities,
    dealsById: indexDealsById(opts.todosOsDeals ?? deals),
    since: SINCE,
    sdrId: opts.sdrId,
  });
}

describe("computeAgendaMetrics — reuniões", () => {
  it("conta atividades de reunião, não deals atribuídos ao SDR (regressão do kpiAggregator)", () => {
    // O cálculo antigo dava 3 aqui: deals do SDR criados no mês.
    const deals = [
      deal("d1", { assignedSdrId: "sdr1", createdAt: NO_MES }),
      deal("d2", { assignedSdrId: "sdr1", createdAt: NO_MES }),
      deal("d3", { assignedSdrId: "sdr1", createdAt: NO_MES }),
    ];
    expect(metricas(deals, [], { sdrId: "sdr1" }).meetingsScheduled).toBe(0);
    expect(metricas(deals, [reuniao({ dealId: "d1" })], { sdrId: "sdr1" }).meetingsScheduled).toBe(1);
  });

  it("ignora atividades de outros tipos", () => {
    const acts = ["call", "email", "whatsapp", "linkedin", "visit", "win", "note"].map(type => reuniao({ type }));
    expect(metricas([], acts).meetingsScheduled).toBe(0);
  });

  it("recorte por SDR usa o userId da atividade; sem sdrId conta o tenant inteiro", () => {
    const acts = [reuniao(), reuniao(), reuniao({ userId: "sdr2" }), reuniao({ userId: "rep1" })];
    expect(metricas([], acts, { sdrId: "sdr1" }).meetingsScheduled).toBe(2);
    expect(metricas([], acts, { sdrId: "sdr2" }).meetingsScheduled).toBe(1);
    expect(metricas([], acts).meetingsScheduled).toBe(4);
  });

  it("só conta reuniões criadas a partir do início do período", () => {
    const acts = [
      reuniao({ createdAt: MES_PASSADO }),
      reuniao({ createdAt: { toDate: () => SINCE } }), // exatamente no limite: conta
      reuniao({ createdAt: undefined }),               // sem data não é datável: não conta
      reuniao(),
    ];
    expect(metricas([], acts).meetingsScheduled).toBe(2);
  });

  it("aceita createdAt como Timestamp do Firestore ou como Date", () => {
    const acts = [reuniao({ createdAt: new Date(2026, 8, 5) }), reuniao({ createdAt: NO_MES })];
    expect(metricas([], acts).meetingsScheduled).toBe(2);
  });

  it("segue a regra do dashboard: tarefa da régua de agenda também é type 'meeting' e conta", () => {
    // Paridade proposital com DashboardPage/tvHelper (ver isMeetingActivity).
    // Se a definição mudar, muda nos três lugares — e este teste junto.
    expect(isMeetingActivity({ type: "meeting", cadenceType: "agenda" } as AgendaActivity)).toBe(true);
  });
});

describe("computeAgendaMetrics — origem das reuniões", () => {
  const inbound = deal("in", { leadOrigin: { leadId: "l1" } });
  const outbound = deal("out", { funnelType: "main" });

  it("resolve a origem pelo deal da atividade", () => {
    const m = metricas([inbound, outbound], [
      reuniao({ dealId: "in" }), reuniao({ dealId: "out" }), reuniao({ dealId: "out" }),
    ]);
    expect(m.meetingsByOrigin).toEqual({ inbound: 1, outbound: 2, unresolved: 0, total: 3 });
  });

  it("reunião sem deal encontrável fica em unresolved — nunca vira Outbound", () => {
    const m = metricas([outbound], [
      reuniao({ dealId: "out" }), reuniao({ dealId: "apagado" }), reuniao({ dealId: undefined }),
    ]);
    expect(m.meetingsByOrigin).toEqual({ inbound: 0, outbound: 1, unresolved: 2, total: 3 });
    const { inbound: i, outbound: o, unresolved: u, total } = m.meetingsByOrigin;
    expect(i + o + u).toBe(total);
  });

  it("resolve pelo índice de TODOS os deals, mesmo fora do produto do snapshot", () => {
    const m = metricas([], [reuniao({ dealId: "in" })], { todosOsDeals: [inbound] });
    expect(m.meetingsByOrigin).toEqual({ inbound: 1, outbound: 0, unresolved: 0, total: 1 });
  });

  it("deriva a origem com computeOrigin, sem confiar no origin gravado", () => {
    const forjado = deal("f", { origin: "inbound" }); // sem leadOrigin nem funnelType inbound
    expect(metricas([forjado], [reuniao({ dealId: "f" })]).meetingsByOrigin.outbound).toBe(1);
  });
});

describe("computeAgendaMetrics — visitas", () => {
  it("conta deals nas etapas de visita do WizMart e de degustação do Smart Café", () => {
    const deals = [
      deal("v1", { stage: "visita_agendada" }),
      deal("v2", { stage: "degustacao_agendada" }),
      deal("v3", { stage: "degustacao_realizada" }),
      deal("x1", { stage: "reuniao_agendada" }),
      deal("x2", { stage: "proposta_apresentada" }),
    ];
    expect(metricas(deals, []).visitsScheduled).toBe(3);
  });

  it("visitScheduledAt no mês não basta: card fora de etapa de visita não conta (regressão)", () => {
    // O cálculo antigo contava "h" e perdia "dg" — degustação não passa por
    // handoff e por isso não tem visitScheduledAt.
    const deals = [
      deal("h", { stage: "proposta_apresentada", assignedSdrId: "sdr1", visitScheduledAt: NO_MES }),
      deal("dg", { stage: "degustacao_agendada", assignedSdrId: "sdr1" }),
    ];
    expect(metricas(deals, [], { sdrId: "sdr1" }).visitsScheduled).toBe(1);
  });

  it("é estoque: deal criado antes do período que está hoje em visita conta", () => {
    const deals = [deal("antigo", { stage: "visita_agendada", createdAt: MES_PASSADO })];
    expect(metricas(deals, []).visitsScheduled).toBe(1);
  });

  it("recorte por SDR usa assignedSdrId", () => {
    const deals = [
      deal("a", { stage: "visita_agendada", assignedSdrId: "sdr1" }),
      deal("b", { stage: "visita_agendada", assignedSdrId: "sdr2" }),
      deal("c", { stage: "visita_agendada", owner: "sdr1" }), // dono, mas não é o SDR atribuído
    ];
    expect(metricas(deals, [], { sdrId: "sdr1" }).visitsScheduled).toBe(1);
    expect(metricas(deals, []).visitsScheduled).toBe(3);
  });

  it("quebra as visitas por origem", () => {
    const deals = [
      deal("a", { stage: "visita_agendada", leadOrigin: { leadId: "l1" } }),
      deal("b", { stage: "degustacao_agendada", funnelType: "inbound" }),
      deal("c", { stage: "visita_agendada" }),
    ];
    expect(metricas(deals, []).visitsByOrigin).toEqual({ inbound: 2, outbound: 1, total: 3 });
  });

  it("sem dados, tudo zerado", () => {
    expect(metricas([], [])).toEqual({
      meetingsScheduled: 0,
      meetingsByOrigin: { inbound: 0, outbound: 0, unresolved: 0, total: 0 },
      visitsScheduled: 0,
      visitsByOrigin: { inbound: 0, outbound: 0, total: 0 },
    });
  });
});

describe("countVisitsByState", () => {
  it("usa a mesma população de visitsScheduled — o mapa soma o total", () => {
    const deals = [
      deal("a", { stage: "visita_agendada", location: { state: "SP" } }),
      deal("b", { stage: "degustacao_agendada", location: { state: "SP" } }),
      deal("c", { stage: "degustacao_realizada", location: { state: "RJ" } }),
      deal("x", { stage: "prospeccao", location: { state: "MG" } }),
    ];
    const porUf = countVisitsByState(deals);
    expect(porUf).toEqual({ SP: 2, RJ: 1 });
    const soma = Object.values(porUf).reduce((s, n) => s + n, 0);
    expect(soma).toBe(metricas(deals, []).visitsScheduled);
  });

  it("uf do deal tem precedência sobre location.state; sem UF vai para 'Sem UF'", () => {
    const deals = [
      deal("a", { stage: "visita_agendada", uf: "PR", location: { state: "SP" } }),
      deal("b", { stage: "visita_agendada" }),
      deal("c", { stage: "visita_agendada", location: { state: "" } }),
    ];
    expect(countVisitsByState(deals)).toEqual({ PR: 1, "Sem UF": 2 });
  });
});
