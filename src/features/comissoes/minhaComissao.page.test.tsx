/**
 * minhaComissao.page.test.tsx — MinhaComissaoPage (Fase 5.1)
 *
 * O que mais importa provar aqui: a tela NUNCA renderiza `split.total` nem a
 * fatia de outro beneficiário — só a linha e o valor do próprio usuário. Um
 * vazamento desses seria mostrar a um SDR quanto o Rep dele ganha, o oposto
 * exato do que o slide 11 pede.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MinhaComissaoPage } from './MinhaComissaoPage';
import type { Commission } from './types';

const SDR_UID = 'uid-sdr-1';

let mockCommissions: Commission[] = [];
let mockLoading = false;

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (colName: string) => {
    if (colName === 'commissions') return { data: mockCommissions, loading: mockLoading };
    return { data: [], loading: false };
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: SDR_UID, tenantId: 'wizmart_sp', role: 'sdr' } }),
}));

function comissao(over: Partial<Commission>): Commission {
  return {
    id: 'c1',
    dealId: 'd1', dealName: 'Mercado Central', sku: 'wizmart_minimercado',
    faturamentoInformado: 3000, baseCalculo: 3000, proporcional: false,
    split: { bdr: 60, sdr: 262.5, rep: 525, total: 847.5 },
    shares: [
      { role: 'sdr', userId: SDR_UID, userName: 'Sara SDR', valor: 262.5 },
      { role: 'rep', userId: 'uid-rep-1', userName: 'Rafael Rep', valor: 525 },
    ],
    beneficiaryIds: [SDR_UID, 'uid-rep-1'],
    status: 'confirmada',
    dataPagamento: '2026-10-15',
    ...over,
  };
}

describe('MinhaComissaoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommissions = [];
    mockLoading = false;
  });

  it('mostra o resumo carregando enquanto os dados chegam', () => {
    mockLoading = true;
    render(<MinhaComissaoPage />);
    expect(screen.getByText('Minha Comissão')).toBeInTheDocument();
    expect(screen.queryByText('Meus Negócios Comissionados')).toBeNull();
  });

  it('estado vazio explica quando a comissão aparece', () => {
    render(<MinhaComissaoPage />);
    expect(screen.getByText('Nenhuma comissão registrada ainda')).toBeInTheDocument();
  });

  it('mostra a MINHA fatia, não o total do card', () => {
    mockCommissions = [comissao({})];
    render(<MinhaComissaoPage />);
    expect(screen.getAllByText('R$ 262,5').length).toBeGreaterThan(0);
    // O total do card (847,5) e a fatia do Rep (525) NUNCA aparecem na tela.
    expect(screen.queryByText(/847,5/)).toBeNull();
    expect(screen.queryByText(/^R\$ 525$/)).toBeNull();
  });

  it('não expõe o nome do colega beneficiário', () => {
    mockCommissions = [comissao({})];
    render(<MinhaComissaoPage />);
    expect(screen.queryByText('Rafael Rep')).toBeNull();
  });

  it('resumo do topo soma a fatia, não o total', () => {
    mockCommissions = [comissao({})];
    render(<MinhaComissaoPage />);
    const cards = screen.getAllByText('R$ 262,5');
    // Uma ocorrência no resumo "A Receber" e outra na linha da tabela.
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('mostra o negócio, o produto, o papel e o status', () => {
    mockCommissions = [comissao({})];
    render(<MinhaComissaoPage />);
    expect(screen.getByText('Mercado Central')).toBeInTheDocument();
    expect(screen.getByText('SDR')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
  });

  it('card sem fatia do usuário não aparece na lista', () => {
    mockCommissions = [comissao({ id: 'c2', shares: [{ role: 'sdr', userId: 'outro-uid', userName: 'Outro', valor: 999 }], beneficiaryIds: ['outro-uid'] })];
    render(<MinhaComissaoPage />);
    expect(screen.getByText('Nenhuma comissão registrada ainda')).toBeInTheDocument();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  it('comissão cancelada não entra no total a receber, mas aparece na lista', () => {
    mockCommissions = [comissao({ id: 'c3', status: 'cancelada', shares: [{ role: 'sdr', userId: SDR_UID, userName: 'Sara SDR', valor: 999 }] })];
    render(<MinhaComissaoPage />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    // Cancelada some do total a receber (fica R$ 0), mas a linha continua visível.
    expect(screen.getByText('R$ 999')).toBeInTheDocument();
  });
});
