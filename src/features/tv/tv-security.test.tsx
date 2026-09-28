import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TVPage } from './TVPage';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'test-tv-token' }),
  useNavigate: () => vi.fn(),
}));

let mockSnapshotValue: any = null;

// Mock firebase/database
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: (_refObj: any, callback: any) => {
    if (mockSnapshotValue !== null) {
      // Executa o callback de forma síncrona
      callback({
        val: () => mockSnapshotValue
      });
    }
    return vi.fn();
  },
  off: vi.fn(),
}));

vi.mock('../../config/firebase', () => ({
  rtdb: {},
}));

describe('Segurança do TVPage - Ocultação de Dados Financeiros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotValue = null;
  });

  it('deve exibir dados financeiros quando allowedMetrics contiver financeiro_real', async () => {
    mockSnapshotValue = {
      tenantName: 'Filial Central de Testes',
      allowedMetrics: ['meta_pct', 'ganhos_hoje_count', 'tarefas', 'ranking_pontos', 'financeiro_real'],
      live_kpis: {
        monthRevenue: 750000,
        monthGoal: 1000000,
        todayDeals: 5,
        todayRevenue: 25000
      },
      sellers: [
        { name: 'João Silva', val: 50000, pct: 100 }
      ],
      tasks: { done: 10, total: 15 },
      leaderboard: [
        { id: '1', name: 'João Silva', rank: 1, streak: 3, pts: 500, initials: 'JS', color: '#1A6B1A' }
      ]
    };

    render(<TVPage />);

    // Deve renderizar os valores financeiros em formato BRL
    expect(screen.getByText('R$ 750.000')).toBeInTheDocument();
    expect(screen.getByText('R$ 25.000')).toBeInTheDocument();
  });

  it('deve ocultar dados financeiros e exibir percentuais quando allowedMetrics NÃO contiver financeiro_real', async () => {
    mockSnapshotValue = {
      tenantName: 'Filial Central de Testes',
      allowedMetrics: ['meta_pct', 'ganhos_hoje_count', 'tarefas', 'ranking_pontos'], // sem financeiro_real
      live_kpis: {
        monthRevenue: 750000,
        monthGoal: 1000000,
        todayDeals: 5,
        todayRevenue: 25000
      },
      sellers: [
        { name: 'João Silva', val: 50000, pct: 75 }
      ],
      tasks: { done: 10, total: 15 },
      leaderboard: [
        { id: '1', name: 'João Silva', rank: 1, streak: 3, pts: 500, initials: 'JS', color: '#1A6B1A' }
      ]
    };

    render(<TVPage />);

    // Verificamos que o faturamento monetário real NÃO é mostrado
    expect(screen.queryByText('R$ 750.000')).toBeNull();
    expect(screen.queryByText('R$ 25.000')).toBeNull();

    // Em vez de "R$ 750.000", exibe "75% Atingido" ou similar
    expect(screen.getByText('75% Atingido')).toBeInTheDocument();
    expect(screen.getByText('75% da meta concluída')).toBeInTheDocument();
  });
  // ── Fase 4 do PLANO_DESENHO_CRM.md — agenda com quebra por origem ──────────

  const BASE_TV = {
    tenantName: 'Filial Central de Testes',
    live_kpis: { monthRevenue: 750000, monthGoal: 1000000, todayDeals: 5, todayRevenue: 25000 },
    sellers: [{ name: 'João Silva', val: 50000, pct: 75 }],
    tasks: { done: 10, total: 15 },
    leaderboard: [{ id: '1', name: 'João Silva', rank: 1, streak: 3, pts: 500, initials: 'JS', color: '#1A6B1A' }],
  };

  it('exibe reuniões e visitas com a quebra Inbound/Outbound quando agenda_origem está habilitada', async () => {
    mockSnapshotValue = {
      ...BASE_TV,
      allowedMetrics: ['meta_pct', 'tarefas', 'agenda_origem'],
      agenda: {
        meetings: { inbound: 0, outbound: 3, unresolved: 0, total: 3 },
        visits:   { inbound: 1, outbound: 2, total: 3 },
      },
    };

    render(<TVPage />);

    expect(screen.getByText('Agenda do Mês — Inbound × Outbound')).toBeInTheDocument();
    // O exemplo do slide 2 do deck, literalmente.
    expect(screen.getByText('0 Inbound')).toBeInTheDocument();
    expect(screen.getByText('3 Outbound')).toBeInTheDocument();
    expect(screen.getByText('1 Inbound')).toBeInTheDocument();
    expect(screen.getByText('2 Outbound')).toBeInTheDocument();
  });

  it('não exibe a agenda quando o canal não tem a métrica agenda_origem', async () => {
    mockSnapshotValue = {
      ...BASE_TV,
      allowedMetrics: ['meta_pct', 'tarefas'],
      // O tvHelper não envia o dado para canal sem a permissão; aqui simulamos
      // o pior caso — payload antigo que ainda o carrega — e a UI segue ocultando.
      agenda: {
        meetings: { inbound: 9, outbound: 9, unresolved: 0, total: 18 },
        visits:   { inbound: 9, outbound: 9, total: 18 },
      },
    };

    render(<TVPage />);

    expect(screen.queryByText('Agenda do Mês — Inbound × Outbound')).toBeNull();
    expect(screen.queryByText('9 Inbound')).toBeNull();
  });

  it('não quebra quando a métrica está habilitada mas o payload não tem agenda', async () => {
    mockSnapshotValue = {
      ...BASE_TV,
      allowedMetrics: ['meta_pct', 'tarefas', 'agenda_origem'],
      agenda: null,
    };

    render(<TVPage />);

    expect(screen.queryByText('Agenda do Mês — Inbound × Outbound')).toBeNull();
    // A TV continua renderizando o resto normalmente (o nome do canal vem
    // prefixado por "| " no header, daí o matcher por substring).
    expect(screen.getByText(/Filial Central de Testes/)).toBeInTheDocument();
    expect(screen.getByText('Tarefas Concluídas')).toBeInTheDocument();
  });

  it('mostra "sem origem" quando há reuniões sem negócio resolvido', async () => {
    mockSnapshotValue = {
      ...BASE_TV,
      allowedMetrics: ['agenda_origem'],
      agenda: {
        meetings: { inbound: 1, outbound: 1, unresolved: 2, total: 4 },
        visits:   { inbound: 0, outbound: 0, total: 0 },
      },
    };

    render(<TVPage />);

    expect(screen.getByText('2 sem origem')).toBeInTheDocument();
  });
});
