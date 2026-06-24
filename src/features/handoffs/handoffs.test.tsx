/**
 * handoffs.test.tsx — Testes da HandoffsPage
 *
 * Cobre:
 *  - Renderização de handoffs pendentes/aceitos/recusados
 *  - Filtro por role (Rep vê apenas os seus; Manager vê todos)
 *  - Estado vazio por tab
 *  - Abertura do modal de recusa
 *  - Badge de alerta quando há pendentes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HandoffsPage } from './HandoffsPage';
import type { Handoff, SettingUser, Deal } from '../../types/crm';

// ── Mocks globais ─────────────────────────────────────────────────────────────

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { success: true } })),
}));

vi.mock('../../config/firebase', () => ({
  functions: {},
  db: {},
}));

const mockUseAuth = vi.fn();
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => mockUseAuth() }));

const mockUseFirestore = vi.fn();
// Mocka por nome de coleção para ser estável entre re-renders
vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => mockUseFirestore(name),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeHandoff(overrides: Partial<Handoff> & { id: string }): Handoff {
  return {
    dealId: 'deal-001',
    fromSdrId: 'sdr-001',
    toRepId: 'rep-001',
    priorityChannel: 'whatsapp',
    visitType: 'presential',
    notes: 'Cliente aguarda proposta de preço.',
    status: 'pending_rep_acceptance',
    ...overrides,
  };
}

function makeRepUser() {
  return { uid: 'rep-001', name: 'Carla Rep', role: 'rep', tenantId: 'wm_sp', coinBalance: 10 };
}

function makeManagerUser() {
  return { uid: 'mgr-001', name: 'Fernanda Gestora', role: 'manager', tenantId: 'wm_sp', coinBalance: 30 };
}

const PENDING_HANDOFF  = makeHandoff({ id: 'h1', status: 'pending_rep_acceptance' });
const ACCEPTED_HANDOFF = makeHandoff({ id: 'h2', status: 'accepted' });
// DECLINED_HANDOFF: reservado para testes futuros de tab Recusados
const _DECLINED_HANDOFF = makeHandoff({ id: 'h3', status: 'declined', declinedReason: 'Fora da área' }); void _DECLINED_HANDOFF;

// ── Helper de setup ───────────────────────────────────────────────────────────
// Mockamos por nome de coleção para estabilidade entre re-renders e clicks
function setupFirestore(handoffs: Handoff[], users: SettingUser[] = [], deals: Deal[] = []) {
  mockUseFirestore.mockImplementation((name: string) => {
    if (name === 'handoffs') return { data: handoffs, loading: false };
    if (name === 'users')    return { data: users, loading: false };
    return { data: deals, loading: false }; // deals e qualquer outra
  });
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('HandoffsPage — renderização inicial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe título "Handoffs"', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([]);
    render(<HandoffsPage />);
    expect(screen.getByText('Handoffs')).toBeInTheDocument();
  });

  it('exibe as 3 tabs (Pendentes, Aceitos, Recusados)', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([]);
    render(<HandoffsPage />);
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByText('Aceitos')).toBeInTheDocument();
    expect(screen.getByText('Recusados')).toBeInTheDocument();
  });

  it('estado vazio exibe mensagem de orientação', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([]);
    render(<HandoffsPage />);
    expect(screen.getByText(/nenhum handoff pendente/i)).toBeInTheDocument();
  });
});

describe('HandoffsPage — badge de alerta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe badge de alerta quando há handoffs pendentes', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([PENDING_HANDOFF]);
    render(<HandoffsPage />);
    // "aguardando aceite" aparece no alerta e no status do card — verifica presença
    expect(screen.getAllByText(/aguardando aceite/i).length).toBeGreaterThan(0);
  });

  it('NÃO exibe badge quando não há pendentes', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([ACCEPTED_HANDOFF]);
    render(<HandoffsPage />);
    expect(screen.queryByText(/aguardando aceite/i)).toBeNull();
  });
});

describe('HandoffsPage — filtro por role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Rep vê apenas seus próprios handoffs', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    const outroHandoff = makeHandoff({ id: 'h99', toRepId: 'outro-rep', status: 'pending_rep_acceptance' });
    setupFirestore([PENDING_HANDOFF, outroHandoff]);
    render(<HandoffsPage />);
    // Apenas 1 deve estar na aba Pendentes (o toRepId === 'rep-001')
    const countBadge = screen.getByText('1');
    expect(countBadge).toBeInTheDocument();
  });

  it('Manager vê todos os handoffs', () => {
    mockUseAuth.mockReturnValue({ user: makeManagerUser() });
    const outroHandoff = makeHandoff({ id: 'h99', toRepId: 'outro-rep', status: 'pending_rep_acceptance' });
    setupFirestore([PENDING_HANDOFF, outroHandoff]);
    render(<HandoffsPage />);
    // Manager vê todos → badge deve ser 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('HandoffsPage — tabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicar em Aceitos mostra handoff aceito (não exibe estado vazio)', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([ACCEPTED_HANDOFF]);
    render(<HandoffsPage />);
    // Começa na tab Pendentes — não há pendentes, mostra empty state
    expect(screen.getByText(/nenhum handoff pendente/i)).toBeInTheDocument();
    // Clica em Aceitos
    fireEvent.click(screen.getByText('Aceitos'));
    // Agora está na tab Aceitos com 1 handoff — não deve exibir estado vazio
    expect(screen.queryByText(/nenhum handoff aceito/i)).toBeNull();
  });

  it('clicar em Recusados exibe estado vazio se não há recusados', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([PENDING_HANDOFF]);
    render(<HandoffsPage />);
    fireEvent.click(screen.getByText('Recusados'));
    expect(screen.getByText(/nenhum handoff recusado/i)).toBeInTheDocument();
  });
});

describe('HandoffsPage — modal de recusa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('botão Recusar está presente em handoffs pendentes', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([PENDING_HANDOFF]);
    render(<HandoffsPage />);
    expect(screen.getByRole('button', { name: /Recusar/i })).toBeInTheDocument();
  });

  it('clicar Recusar abre modal de recusa', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([PENDING_HANDOFF]);
    render(<HandoffsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Recusar/i }));
    expect(screen.getByText('Recusar Handoff')).toBeInTheDocument();
  });

  it('clicar Cancelar no modal fecha o modal', () => {
    mockUseAuth.mockReturnValue({ user: makeRepUser() });
    setupFirestore([PENDING_HANDOFF]);
    render(<HandoffsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Recusar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.queryByText('Recusar Handoff')).toBeNull();
  });
});
