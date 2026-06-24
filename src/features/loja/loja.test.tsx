/**
 * loja.test.tsx — Testes da LojaPage
 *
 * Cobre:
 *  - Renderização do grid de prêmios
 *  - Filtros por categoria
 *  - Estado vazio
 *  - Botão desabilitado quando saldo insuficiente
 *  - Abertura do RedeemModal ao clicar em Resgatar
 *  - Cancelar modal fecha o modal
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LojaPage } from './LojaPage';
import type { Prize, CoinRedemption } from '../../types/crm';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { prizeName: 'Voucher', remainingBalance: 30 } })),
}));
vi.mock('../../config/firebase', () => ({ functions: {}, db: {} }));

const mockUseAuth = vi.fn();
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => mockUseAuth() }));

const mockUseFirestore = vi.fn();
const mockAddDocument = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => mockUseFirestore(name),
  useFirestoreMutations: () => ({
    addDocument: mockAddDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(coinBalance = 50, role = 'sdr') {
  return { uid: 'sdr-001', name: 'João SDR', role, tenantId: 'wm_sp', coinBalance };
}

function makePrize(overrides: Partial<Prize> & { id: string }): Prize {
  return {
    name: 'Prêmio Teste',
    description: 'Descrição do prêmio',
    imageUrl: '',
    coinCost: 10,
    stock: -1,
    category: 'voucher',
    isActive: true,
    ...overrides,
  };
}

const PRIZES: Prize[] = [
  makePrize({ id: 'p1', name: 'Voucher iFood',    category: 'voucher',    coinCost: 10 }),
  makePrize({ id: 'p2', name: 'Kit Home Office',  category: 'produto',    coinCost: 25 }),
  makePrize({ id: 'p3', name: 'Day Off',           category: 'experiencia',coinCost: 40 }),
  makePrize({ id: 'p4', name: 'Caro Demais',       category: 'voucher',    coinCost: 999 }),
  makePrize({ id: 'p5', name: 'Prêmio Esgotado',  category: 'voucher',    coinCost: 5, stock: 0 }),
];

function setup(prizes: Prize[] = PRIZES, balance = 50, redemptions: CoinRedemption[] = [], role = 'sdr') {
  mockUseAuth.mockReturnValue({ user: makeUser(balance, role) });
  mockUseFirestore.mockImplementation((name: string) => {
    if (name === 'prizes') return { data: prizes, loading: false };
    return { data: redemptions, loading: false };
  });
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('LojaPage — renderização', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe título "Loja de Prêmios"', () => {
    setup();
    render(<LojaPage />);
    expect(screen.getByText(/Loja de Prêmios/i)).toBeInTheDocument();
  });

  it('exibe saldo do usuário no header', () => {
    setup(PRIZES, 42);
    render(<LojaPage />);
    expect(screen.getByText(/42 moedas/i)).toBeInTheDocument();
  });

  it('exibe todos os prêmios ativos', () => {
    setup();
    render(<LojaPage />);
    expect(screen.getByText('Voucher iFood')).toBeInTheDocument();
    expect(screen.getByText('Kit Home Office')).toBeInTheDocument();
    expect(screen.getByText('Day Off')).toBeInTheDocument();
  });

  it('estado vazio quando não há prêmios', () => {
    setup([]);
    render(<LojaPage />);
    expect(screen.getByText(/Nenhum prêmio disponível/i)).toBeInTheDocument();
  });
});

describe('LojaPage — filtros por categoria', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filtro Vouchers exibe apenas vouchers', () => {
    setup();
    render(<LojaPage />);
    fireEvent.click(screen.getByText(/🎟️ Vouchers/i));
    expect(screen.getByText('Voucher iFood')).toBeInTheDocument();
    expect(screen.queryByText('Kit Home Office')).toBeNull(); // produto
    expect(screen.queryByText('Day Off')).toBeNull();         // experiência
  });

  it('filtro Produtos exibe apenas produtos', () => {
    setup();
    render(<LojaPage />);
    fireEvent.click(screen.getByText(/📦 Produtos/i));
    expect(screen.getByText('Kit Home Office')).toBeInTheDocument();
    expect(screen.queryByText('Voucher iFood')).toBeNull();
  });

  it('filtro Experiências exibe apenas experiências', () => {
    setup();
    render(<LojaPage />);
    fireEvent.click(screen.getByText(/✨ Experiências/i));
    expect(screen.getByText('Day Off')).toBeInTheDocument();
    expect(screen.queryByText('Voucher iFood')).toBeNull();
  });

  it('filtro Todos mostra tudo', () => {
    setup();
    render(<LojaPage />);
    fireEvent.click(screen.getByText('Todos'));
    expect(screen.getByText('Voucher iFood')).toBeInTheDocument();
    expect(screen.getByText('Kit Home Office')).toBeInTheDocument();
  });
});

describe('LojaPage — estados de botão', () => {
  beforeEach(() => vi.clearAllMocks());

  it('botão habilitado quando tem saldo suficiente', () => {
    setup([makePrize({ id: 'px', coinCost: 10 })], 50);
    render(<LojaPage />);
    const btn = screen.getByRole('button', { name: /Resgatar/i });
    expect(btn).not.toBeDisabled();
  });

  it('botão desabilitado quando saldo insuficiente', () => {
    setup([makePrize({ id: 'px', coinCost: 999 })], 5);
    render(<LojaPage />);
    expect(screen.getByRole('button', { name: /Saldo insuficiente/i })).toBeDisabled();
  });

  it('botão desabilitado quando estoque = 0', () => {
    setup([makePrize({ id: 'px', stock: 0, coinCost: 5 })], 50);
    render(<LojaPage />);
    expect(screen.getByRole('button', { name: /Esgotado/i })).toBeDisabled();
  });
});

describe('LojaPage — modal de resgate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicar em Resgatar abre o modal de confirmação', () => {
    setup([makePrize({ id: 'px', name: 'Voucher Teste', coinCost: 10 })], 50);
    render(<LojaPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resgatar/i }));
    expect(screen.getByText('Confirmar Resgate')).toBeInTheDocument();
    // O nome pode aparecer no card e no modal — verifica presença
    expect(screen.getAllByText('Voucher Teste').length).toBeGreaterThan(0);
  });

  it('cancelar no modal fecha o modal', () => {
    setup([makePrize({ id: 'px', coinCost: 10 })], 50);
    render(<LojaPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resgatar/i }));
    expect(screen.getByText('Confirmar Resgate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.queryByText('Confirmar Resgate')).toBeNull();
  });

  it('modal exibe saldo restante após resgate', () => {
    setup([makePrize({ id: 'px', coinCost: 10 })], 50);
    render(<LojaPage />);
    fireEvent.click(screen.getByRole('button', { name: /Resgatar/i }));
    // Saldo após = 50 - 10 = 40
    expect(screen.getByText(/40 moedas/i)).toBeInTheDocument();
  });
});

describe('LojaPage — gerenciamento de prêmios (Admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('vendedor normal (role sdr) NÃO visualiza o botão de Adicionar Prêmio nem botões de editar/excluir', () => {
    setup(PRIZES, 50, [], 'sdr');
    render(<LojaPage />);
    expect(screen.queryByRole('button', { name: /Adicionar Prêmio/i })).toBeNull();
    expect(screen.queryByTitle('Editar Prêmio')).toBeNull();
    expect(screen.queryByTitle('Excluir Prêmio')).toBeNull();
  });

  it('gestor (role manager) visualiza o botão de Adicionar Prêmio e botões de editar/excluir', () => {
    setup(PRIZES, 50, [], 'manager');
    render(<LojaPage />);
    expect(screen.getByRole('button', { name: /Adicionar Prêmio/i })).toBeInTheDocument();
    expect(screen.getAllByTitle('Editar Prêmio').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Excluir Prêmio').length).toBeGreaterThan(0);
  });

  it('abrir modal de Novo Prêmio e submeter formulário chama addDocument', () => {
    setup(PRIZES, 50, [], 'manager');
    render(<LojaPage />);

    // Clica para adicionar prêmio
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Prêmio/i }));
    expect(screen.getByText('Novo Prêmio')).toBeInTheDocument();

    // Preenche e envia formulário
    fireEvent.change(screen.getByPlaceholderText('Ex: Voucher iFood R$ 50'), { target: { value: 'Novo Vale Refeição' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Prêmio/i }));

    expect(mockAddDocument).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Novo Vale Refeição',
    }));
  });

  it('abrir modal de Editar Prêmio e submeter formulário chama updateDocument', () => {
    setup([makePrize({ id: 'p1', name: 'Prêmio A', coinCost: 10 })], 50, [], 'manager');
    render(<LojaPage />);

    // Clica para editar prêmio
    fireEvent.click(screen.getByTitle('Editar Prêmio'));
    expect(screen.getByText('Editar Prêmio')).toBeInTheDocument();

    // Altera nome e envia
    fireEvent.change(screen.getByPlaceholderText('Ex: Voucher iFood R$ 50'), { target: { value: 'Prêmio A Editado' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Prêmio/i }));

    expect(mockUpdateDocument).toHaveBeenCalledWith('p1', expect.objectContaining({
      name: 'Prêmio A Editado',
    }));
  });

  it('clicar em excluir prêmio chama deleteDocument após confirmação', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    setup([makePrize({ id: 'p1', name: 'Prêmio A', coinCost: 10 })], 50, [], 'manager');
    render(<LojaPage />);

    // Clica para excluir prêmio
    fireEvent.click(screen.getByTitle('Excluir Prêmio'));
    expect(mockDeleteDocument).toHaveBeenCalledWith('p1');
  });
});
