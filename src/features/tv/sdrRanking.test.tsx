/**
 * sdrRanking.test.tsx — Ranking do Time de SDRs na TV (PLANO_DESENHO_CRM_2, Fase B)
 * Cobre o painel isolado e a integração com o TVPage (gate por `ranking_sdr`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SdrRankingPanel, pctColor, type SdrRankingData } from './SdrRankingPanel';
import { TVPage } from './TVPage';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'tv_x' }),
  useNavigate: () => vi.fn(),
}));

let mockSnapshotValue: any = null;
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: (_r: any, cb: any) => {
    if (mockSnapshotValue !== null) cb({ val: () => mockSnapshotValue });
    return vi.fn();
  },
  off: vi.fn(),
}));
vi.mock('../../config/firebase', () => ({ rtdb: {} }));

const theme = { accent: '#8DB600', textMuted: '#7da87d', border: 'rgba(0,0,0,.2)', bgDark: '#0A1F0A' };

const row = (name: string, visits: number, extra: Record<string, number> = {}) => ({
  name, initials: name.slice(0, 2).toUpperCase(), color: '#1A6B1A',
  actDone: 3, actTotal: 6, actPct: 50, meetingsScheduled: 2, meetingsDone: 1, visits, ...extra,
});

// A ordem já vem pronta do servidor — a TV só exibe.
const DATA: SdrRankingData = {
  day: [row('Ana', 1)],
  week: [row('Bia', 5), row('Ana', 4), row('Cris', 3), row('Duda', 2), row('Eva', 1), row('Fabi', 0)],
  month: [row('Ana', 20), row('Bia', 18)],
};

describe('pctColor — faixas da tabela de referência do cliente', () => {
  it('verde ao bater 100%, laranja perto, vermelho longe', () => {
    expect(pctColor(100)).toBe('#4ADE80');
    expect(pctColor(88)).toBe('#FBBF24');
    expect(pctColor(50)).toBe('#F87171');
  });
});

describe('SdrRankingPanel', () => {
  it('pódio com os 3 primeiros e os demais na lista, como no slide 2', () => {
    render(<SdrRankingPanel data={DATA} theme={theme} defaultPeriod="week" />);
    expect(within(screen.getByTestId('podio-1')).getByText('Bia')).toBeInTheDocument();
    expect(within(screen.getByTestId('podio-1')).getByTestId('visitas')).toHaveTextContent('5');
    expect(within(screen.getByTestId('podio-2')).getByText('Ana')).toBeInTheDocument();
    expect(within(screen.getByTestId('podio-3')).getByText('Cris')).toBeInTheDocument();
    const lista = screen.getByTestId('lista');
    expect(within(lista).getByText('Duda')).toBeInTheDocument();
    expect(within(lista).getByText('Eva')).toBeInTheDocument();
    expect(within(lista).getByText('Fabi')).toBeInTheDocument();
    expect(within(lista).queryByText('Bia')).toBeNull();
  });

  it('cada SDR mostra os indicadores pedidos: atividades, reuniões agendadas e realizadas', () => {
    render(<SdrRankingPanel data={DATA} theme={theme} defaultPeriod="week" />);
    const p1 = within(screen.getByTestId('podio-1'));
    expect(p1.getByTestId('ind-atividades')).toHaveTextContent('3/6');
    expect(p1.getByTestId('ind-reunioes-agendadas')).toHaveTextContent('2');
    expect(p1.getByTestId('ind-reunioes-realizadas')).toHaveTextContent('1');
  });

  it('filtro de período troca o ranking sem recarregar', () => {
    render(<SdrRankingPanel data={DATA} theme={theme} defaultPeriod="week" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(within(screen.getByTestId('podio-1')).getByText('Ana')).toBeInTheDocument();
    expect(within(screen.getByTestId('podio-1')).getByTestId('visitas')).toHaveTextContent('20');
    expect(screen.queryByTestId('lista')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
    expect(screen.queryByTestId('podio-2')).toBeNull();
  });

  it('respeita o período inicial configurado no link', () => {
    render(<SdrRankingPanel data={DATA} theme={theme} defaultPeriod="month" />);
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('visita no singular', () => {
    render(<SdrRankingPanel data={{ day: [row('Ana', 1)] }} theme={theme} defaultPeriod="day" />);
    expect(screen.getByText('visita')).toBeInTheDocument();
  });

  it('sem SDR ativo mostra estado vazio', () => {
    render(<SdrRankingPanel data={{ week: [] }} theme={theme} defaultPeriod="week" />);
    expect(screen.getByText('Nenhum SDR ativo para exibir.')).toBeInTheDocument();
  });
});

const baseSnap = {
  tenantName: 'TV Vendas', productId: 'wizmart',
  live_kpis: { monthRevenue: 0, monthGoal: 1, todayDeals: 0, todayRevenue: 0 },
  sellers: [], tasks: { done: 0, total: 1 }, leaderboard: [],
};

describe('TVPage — Ranking de SDRs', () => {
  beforeEach(() => { mockSnapshotValue = null; });

  it('link só de ranking ocupa a tela inteira', () => {
    mockSnapshotValue = { ...baseSnap, allowedMetrics: ['ranking_sdr'], ranking_sdr: DATA, rankingPeriod: 'week' };
    render(<TVPage />);
    expect(screen.getByTestId('podio')).toBeInTheDocument();
    expect(screen.queryByText(/Meta de Vendas do Mês/)).toBeNull();
  });

  it('misturado com outras métricas aparece como card, junto do resto', () => {
    mockSnapshotValue = { ...baseSnap, allowedMetrics: ['ranking_sdr', 'tarefas'], ranking_sdr: DATA };
    render(<TVPage />);
    expect(screen.getByTestId('podio')).toBeInTheDocument();
  });

  it('sem a métrica ranking_sdr não exibe nada, mesmo que o dado venha no snapshot', () => {
    mockSnapshotValue = { ...baseSnap, allowedMetrics: ['tarefas'], ranking_sdr: DATA };
    render(<TVPage />);
    expect(screen.queryByTestId('podio')).toBeNull();
    expect(screen.queryByText('Bia')).toBeNull();
  });

  it('métrica ligada mas dado ausente (servidor não enviou) não quebra a tela', () => {
    mockSnapshotValue = { ...baseSnap, allowedMetrics: ['ranking_sdr', 'tarefas'], ranking_sdr: null };
    render(<TVPage />);
    expect(screen.queryByTestId('podio')).toBeNull();
  });
});
