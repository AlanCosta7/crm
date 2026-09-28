import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KPIsPage } from './KPIsPage';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock useAuthStore
let mockUser: any = null;
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: mockUser,
  }),
}));

// Mock Firestore hooks
let mockDeals: any[] = [];
let mockActivities: any[] = [];
let mockCoinLedger: any[] = [];
let mockUsers: any[] = [];
let mockFunnels: any[] = [];
let mockTvLinks: any[] = [];

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (colName: string) => {
    if (colName === 'deals') return { data: mockDeals, loading: false };
    if (colName === 'activities') return { data: mockActivities, loading: false };
    if (colName === 'coin_ledger') return { data: mockCoinLedger, loading: false };
    if (colName === 'users') return { data: mockUsers, loading: false };
    if (colName === 'funnels') return { data: mockFunnels, loading: false };
    if (colName === 'tv_links') return { data: mockTvLinks, loading: false };
    return { data: [], loading: false };
  },
  useFirestoreMutations: () => ({
    addDocument: vi.fn(),
    deleteDocument: vi.fn(),
  }),
}));

describe('KPIsPage - Filtros, Papéis e Consolidação de Métricas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      uid: 'rep-001',
      name: 'Carla Rep',
      role: 'rep',
      tenantId: 'wizmart_sp',
    };
    mockDeals = [
      { id: 'deal-1', name: 'Deal 1', value: 10000, stage: 'fecham', status: 'won', productId: 'wizmart', assignedRepId: 'rep-001', updatedAt: { toDate: () => new Date() }, createdAt: { toDate: () => new Date() } },
      { id: 'deal-2', name: 'Deal 2', value: 5000, stage: 'propos', status: 'open', productId: 'smart_cafe', assignedRepId: 'rep-001', updatedAt: { toDate: () => new Date() }, createdAt: { toDate: () => new Date() } },
    ];
    mockActivities = [
      { id: 'act-1', type: 'call', status: 'completed', userId: 'rep-001', productId: 'wizmart', createdAt: { toDate: () => new Date() } },
    ];
    mockCoinLedger = [
      { userId: 'rep-001', amount: 5, type: 'activity_ontime', createdAt: { toDate: () => new Date() } },
    ];
    mockUsers = [
      { id: 'rep-001', name: 'Carla Rep', role: 'rep', initials: 'CR', color: '#B91C1C', points: 100, coinBalance: 5 },
      { id: 'sdr-001', name: 'João SDR', role: 'sdr', initials: 'JS', color: '#B45309', points: 80, coinBalance: 10 },
    ];
    mockFunnels = [
      { id: 'hunter-wizmart', name: 'Hunter', type: 'hunter', productId: 'wizmart', stages: [{ id: 'fecham', name: 'Fechamento', order: 1 }] },
    ];
    mockTvLinks = [];
  });

  it('deve renderizar o painel individual do Representante se o usuário logado for rep', () => {
    render(<KPIsPage />);

    // Deve mostrar as métricas individuais de Representante
    expect(screen.getByText('Visitas Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Propostas Apresentadas')).toBeInTheDocument();
    expect(screen.getByText('Contratos Assinados')).toBeInTheDocument();
    
    // Deve mostrar a carteira de moedas
    expect(screen.getByText('Minha Carteira')).toBeInTheDocument();
    expect(screen.getByText('5 🪙')).toBeInTheDocument();
  });

  it('deve renderizar o painel individual do SDR se o usuário logado for sdr', () => {
    mockUser.role = 'sdr';
    mockUser.uid = 'sdr-001';
    mockUser.name = 'João SDR';

    render(<KPIsPage />);

    // Deve mostrar as métricas individuais de SDR
    expect(screen.getByText('Conclusão da Cadência Diária')).toBeInTheDocument();
    expect(screen.getByText('Meetings Agendados')).toBeInTheDocument();
    expect(screen.getByText('Visitas Agendadas')).toBeInTheDocument();
    expect(screen.getByText('Moedas do Ciclo')).toBeInTheDocument();
  });

  it('SDR: Meetings conta atividades de reunião do período, e Visitas conta deals em etapa de visita', () => {
    mockUser.role = 'sdr';
    mockUser.uid = 'sdr-001';
    mockUser.name = 'João SDR';
    const agora = { toDate: () => new Date() };
    const antigo = { toDate: () => new Date(Date.now() - 400 * 86_400_000) };

    mockDeals = [
      // Handoff criado agora (tem visitType/visitScheduledAt) mas fora de etapa de
      // visita: o cálculo antigo contava como reunião E como visita.
      { id: 'd-h', name: 'H', value: 0, stage: 'proposta_apresentada', status: 'open', productId: 'wizmart', assignedSdrId: 'sdr-001', visitType: 'presential', visitScheduledAt: agora, createdAt: agora, updatedAt: agora },
      // Card antigo que está hoje em degustação: o cálculo antigo ignorava.
      { id: 'd-dg', name: 'DG', value: 0, stage: 'degustacao_agendada', status: 'open', productId: 'smart_cafe', assignedSdrId: 'sdr-001', createdAt: antigo, updatedAt: agora },
      { id: 'd-v', name: 'V', value: 0, stage: 'visita_agendada', status: 'open', productId: 'wizmart', assignedSdrId: 'sdr-001', createdAt: agora, updatedAt: agora },
    ];
    mockActivities = [
      { id: 'm1', type: 'meeting', status: 'pending', userId: 'sdr-001', productId: 'wizmart', createdAt: agora },
      { id: 'm2', type: 'meeting', status: 'pending', userId: 'sdr-001', productId: 'wizmart', createdAt: agora },
      { id: 'm-antiga', type: 'meeting', status: 'completed', userId: 'sdr-001', productId: 'wizmart', createdAt: antigo },
      { id: 'c1', type: 'call', status: 'completed', userId: 'sdr-001', productId: 'wizmart', createdAt: agora },
    ];

    render(<KPIsPage />);

    const card = (label: string) => screen.getByText(label).closest('.card') as HTMLElement;
    expect(within(card('Meetings Agendados')).getByText('2')).toBeInTheDocument();
    expect(within(card('Visitas Agendadas')).getByText('2')).toBeInTheDocument();
  });

  it('deve renderizar a visão de Gestão e os filtros se o usuário for master ou manager', () => {
    mockUser.role = 'master';
    mockUser.uid = 'master-001';
    mockUser.name = 'Ricardo Master';

    render(<KPIsPage />);

    // Filtros de produto e vendedor devem estar presentes para a gestão
    expect(screen.getByText('Equipe Inteira')).toBeInTheDocument();
    expect(screen.getByText('Todos Produtos')).toBeInTheDocument();

    // Deve exibir os cards consolidados da Gestão
    // (StatCard divide label e sub: "Faturamento" + "conquistado")
    expect(screen.getByText('Negócios Criados')).toBeInTheDocument();
    expect(screen.getByText('Faturamento')).toBeInTheDocument();
    expect(screen.getByText('conquistado')).toBeInTheDocument();
    expect(screen.getByText('Ticket Médio')).toBeInTheDocument();
    expect(screen.getByText('Vendas por Região')).toBeInTheDocument();
  });
});
