import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardPage } from './LeaderboardPage';

// Mock animejs
vi.mock('animejs', () => ({
  default: vi.fn(),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({ productId: 'all', productScope: 'all' }),
}));

// Mock useAuthStore
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      uid: 'user-001',
      name: 'João SDR',
      email: 'sdr@wizmart.com.br',
      role: 'sdr',
      tenantId: 'wizmart_sp',
      points: 80,
      coinBalance: 15,
      streak: 4,
    },
  }),
}));

// Mock useLeaderboard hook
let mockLeaderboardData: any[] = [];
let mockLoading = false;
vi.mock('../../hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({
    data: mockLeaderboardData,
    loading: mockLoading,
    error: null,
  }),
}));

describe('LeaderboardPage - Visual e Interações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoading = false;
    mockLeaderboardData = [
      {
        id: 'user-001',
        name: 'João SDR',
        initials: 'JS',
        color: '#6B7280',
        pts: 80,
        coinBalance: 15,
        productIds: ['wizmart'],
        emails: 8,
        whats: 10,
        meetings: 2,
        level: 'Jr',
        streak: 4,
        trend: 1,
        rank: 2,
      },
      {
        id: 'user-002',
        name: 'Ana Rep',
        initials: 'AR',
        color: '#1A6B1A',
        pts: 150,
        coinBalance: 35,
        productIds: ['wizmart', 'smart_cafe'],
        emails: 12,
        whats: 5,
        meetings: 6,
        level: 'Pl',
        streak: 6,
        trend: 0,
        rank: 1,
      },
    ];
  });

  it('deve exibir mensagem de carregamento se loading for true', () => {
    mockLoading = true;
    render(<LeaderboardPage />);
    expect(screen.getByText('Carregando classificação do time...')).toBeInTheDocument();
  });

  it('deve exibir pódio e tabela de ranking corretos', () => {
    render(<LeaderboardPage />);

    // Ana Rep deve ser 1º lugar com 150 PTS
    expect(screen.getByText('Ana Rep')).toBeInTheDocument();
    // João SDR deve ser 2º lugar
    expect(screen.getByText('João SDR')).toBeInTheDocument();

    // Deve mostrar as pontuações na tela
    expect(screen.getByText('150 PTS')).toBeInTheDocument();
    expect(screen.getByText('80 PTS')).toBeInTheDocument();
  });

  it('deve mudar a métrica para moedas ao clicar no toggle de Moedas', () => {
    render(<LeaderboardPage />);

    // Por padrão é pontos. Clica no toggle de Moedas
    const coinsToggle = screen.getByText('🪙 Moedas');
    fireEvent.click(coinsToggle);

    // Agora deve ordenar e mostrar valores de moedas
    expect(screen.getByText('35 🪙')).toBeInTheDocument();
    expect(screen.getByText('15 🪙')).toBeInTheDocument();
  });

  it('deve filtrar a listagem por produto ao clicar nos botões de filtro', () => {
    render(<LeaderboardPage />);

    // Clica no filtro "Smart Café"
    const smartCafeFilter = screen.getByRole('button', { name: 'Smart Café' });
    fireEvent.click(smartCafeFilter);

    // Apenas Ana Rep deve ser exibida pois possui o produto smart_cafe
    expect(screen.getByText('Ana Rep')).toBeInTheDocument();
    expect(screen.queryByText('João SDR')).not.toBeInTheDocument();
  });

  it('deve exibir a aba de Galeria de Conquistas e calcular os progressos', () => {
    render(<LeaderboardPage />);

    // Clica na aba Galeria de Conquistas
    const achievementsTabBtn = screen.getByText(/Galeria de Conquistas/);
    fireEvent.click(achievementsTabBtn);

    // Deve mostrar a lista de medalhas/badges
    expect(screen.getByText('Primeiro Contato')).toBeInTheDocument();
    expect(screen.getByText('5 Dias Seguidos')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp Pro')).toBeInTheDocument();

    // WhatsApp Pro tem limite de 10 e João SDR tem 10 whats, então deve estar concluída
    // 5 Dias Seguidos tem limite de 5 e João tem 4 dias, então deve ter progresso 4/5
    expect(screen.getByText('4/5')).toBeInTheDocument();
  });
});
