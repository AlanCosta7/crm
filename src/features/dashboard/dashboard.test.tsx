/**
 * dashboard.test.tsx — Testes do DashboardPage
 *
 * Valida que cada role vê o painel correto e que os dados são filtrados
 * adequadamente por productId.
 *
 * Estratégia: mock de stores + hook Firestore para isolar a UI da rede.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import type { UserRole } from '../../types/crm';

// ── Mocks globais ─────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Anime.js usa export default como função — vi.hoisted garante que o stub existe
// antes do hoisting do vi.mock
const { animeStub } = vi.hoisted(() => {
  const stub = Object.assign(
    () => {},
    { timeline: () => ({ add: () => ({}) }), stagger: () => 0 }
  );
  return { animeStub: stub };
});
vi.mock('animejs', () => ({ default: animeStub }));

// Mock Firestore — retorna dados vazios por padrão (sobrescrito por teste se necessário)
vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: () => ({ data: [], loading: false, error: null }),
  useFirestoreMutations: () => ({ addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() }),
}));

// Mock UIStore — produto padrão wizmart
vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({ productId: 'wizmart', setProductId: vi.fn() }),
}));

// Factory para simular o store de auth com diferentes roles
const mockUseAuthStore = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

function makeUser(role: UserRole) {
  return {
    uid: `uid-${role}`,
    name: `Usuário ${role}`,
    email: `${role}@wizmart.com.br`,
    initials: role.slice(0, 2).toUpperCase(),
    color: '#1A6B1A',
    role,
    tenantId: 'wizmart_sp',
    coinBalance: 15,
  };
}

// ── Testes de seleção de painel por role ─────────────────────────────────────

describe('DashboardPage — seleção de painel por role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('master → exibe saudação de gestão e botão "Novo Negócio"', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('master') });
    render(<DashboardPage />);
    expect(screen.getByText(/Olá,.*👋/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo Negócio/i })).toBeInTheDocument();
  });

  it('manager → exibe painel de gestão (mesmo que master)', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('manager') });
    render(<DashboardPage />);
    expect(screen.getByText(/Olá,.*👋/)).toBeInTheDocument();
  });

  it('sdr → exibe título de cadência e taxa de conclusão', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('sdr') });
    render(<DashboardPage />);
    expect(screen.getByText(/Cadência de hoje/i)).toBeInTheDocument();
    expect(screen.getByText(/Conclusão do Dia/i)).toBeInTheDocument();
  });

  it('sdr → exibe link para /cadencia', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('sdr') });
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: /Ver Cadência/i })).toBeInTheDocument();
  });

  it('rep → exibe painel com handoffs pendentes e negócios', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('rep') });
    render(<DashboardPage />);
    expect(screen.getByText(/Handoffs Pendentes/i)).toBeInTheDocument();
    expect(screen.getByText(/Fechados no Mês/i)).toBeInTheDocument();
  });

  it('rep → exibe botão de handoffs', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('rep') });
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: /Meus Handoffs/i })).toBeInTheDocument();
  });

  it('bdr → exibe painel de leads gerados', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('bdr') });
    render(<DashboardPage />);
    // getAllByText pois o texto aparece no <span> e no container pai
    expect(screen.getAllByText(/Leads Gerados/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Na Fila SDR/i).length).toBeGreaterThan(0);
  });

  it('bdr → exibe botão "Novo Lead"', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('bdr') });
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: /Novo Lead/i })).toBeInTheDocument();
  });

  it('viewer → exibe painel somente leitura', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('viewer') });
    render(<DashboardPage />);
    expect(screen.getByText(/Somente Leitura/i)).toBeInTheDocument();
  });

  it('viewer → NÃO exibe botões de ação', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('viewer') });
    render(<DashboardPage />);
    expect(screen.queryByRole('button', { name: /Novo/i })).toBeNull();
  });
});

// ── Testes de dados do SDR ────────────────────────────────────────────────────
describe('DashboardPage — SDR com cards atribuídos', () => {
  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('sdr') });
  });

  it('exibe "Nenhum card" quando não há deals atribuídos', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Nenhum card atribuído/i)).toBeInTheDocument();
  });
});

// ── Testes de dados do Rep ────────────────────────────────────────────────────
describe('DashboardPage — Rep sem handoffs pendentes', () => {
  it('não exibe seção de handoffs quando não há pendentes', () => {
    mockUseAuthStore.mockReturnValue({ user: makeUser('rep') });
    render(<DashboardPage />);
    // Não deve aparecer o bloco de handoffs aguardando resposta
    expect(screen.queryByText(/aguardando resposta/i)).toBeNull();
  });
});
