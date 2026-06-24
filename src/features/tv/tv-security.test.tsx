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
});
