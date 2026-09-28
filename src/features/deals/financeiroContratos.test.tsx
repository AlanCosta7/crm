/**
 * financeiroContratos.test.tsx — FinanceiroContratosPage (Fase 5.4)
 *
 * O que mais importa: só entra na lista de pendentes quem é Comodato Smart
 * Café COM contrato e SEM pagamento — e "Confirmar Pagamento" grava
 * exatamente `contractPaidAt` + `contractPaidBy`, nada além disso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FinanceiroContratosPage } from './FinanceiroContratosPage';
import type { Deal } from '../../types/crm';

let mockDeals: Deal[] = [];
let mockLoading = false;
const updateDocument = vi.fn();

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: () => ({ data: mockDeals, loading: mockLoading }),
  useFirestoreMutations: () => ({ updateDocument }),
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'financeiro-1', tenantId: 'wizmart_sp', role: 'financeiro' } }),
}));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  where: vi.fn(),
}));

const contrato = { url: 'https://x/contrato.pdf', storagePath: 'p', fileName: 'contrato.pdf', mime: 'application/pdf', size: 100, uploadedBy: 'rep-1', uploadedAt: new Date() };

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: 'd1', name: 'Franquia X', company: 'Franquia X LTDA', value: 15000, stage: 'contrato_assinado',
    productId: 'smart_cafe', mainProduct: 'smartcafe_comodato', owner: 'rep-1', due: '—',
    tasks: { e: false, w: false, m: false },
    ...over,
  } as Deal;
}

describe('FinanceiroContratosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeals = [];
    mockLoading = false;
  });

  it('mostra o estado vazio quando não há pendências', () => {
    render(<FinanceiroContratosPage />);
    expect(screen.getByText('Nada pendente no momento')).toBeInTheDocument();
  });

  it('lista um comodato com contrato e sem pagamento como pendente', () => {
    mockDeals = [deal({ contract: contrato })];
    render(<FinanceiroContratosPage />);
    expect(screen.getByText('Franquia X LTDA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver contrato/ })).toHaveAttribute('href', contrato.url);
    expect(screen.getByRole('button', { name: /Confirmar Pagamento/ })).toBeInTheDocument();
  });

  it('comodato sem contrato ainda não aparece como pendente', () => {
    mockDeals = [deal({ id: 'd2' })]; // sem `contract`
    render(<FinanceiroContratosPage />);
    expect(screen.getByText('Nada pendente no momento')).toBeInTheDocument();
  });

  it('comodato já pago vai para "Já validados", não para pendentes', () => {
    mockDeals = [deal({ id: 'd3', contract: contrato, contractPaidAt: '2026-07-15T00:00:00.000Z' })];
    render(<FinanceiroContratosPage />);
    expect(screen.getByText('Nada pendente no momento')).toBeInTheDocument();
    expect(screen.getByText('Já validados')).toBeInTheDocument();
    expect(screen.getAllByText('Franquia X LTDA')).toHaveLength(1); // só na tabela de validados
  });

  it('confirmar pagamento grava contractPaidAt e contractPaidBy — nada além disso', async () => {
    mockDeals = [deal({ contract: contrato })];
    render(<FinanceiroContratosPage />);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Pagamento/ }));

    await waitFor(() => expect(updateDocument).toHaveBeenCalledOnce());
    const [dealId, patch] = updateDocument.mock.calls[0];
    expect(dealId).toBe('d1');
    expect(Object.keys(patch).sort()).toEqual(['contractPaidAt', 'contractPaidBy']);
    expect(patch.contractPaidBy).toBe('financeiro-1');
  });

  it('conta os pendentes e os validados nos badges', () => {
    mockDeals = [
      deal({ id: 'p1', contract: contrato }),
      deal({ id: 'p2', contract: contrato }),
      deal({ id: 'v1', contract: contrato, contractPaidAt: '2026-06-15T00:00:00.000Z' }),
    ];
    render(<FinanceiroContratosPage />);
    // Um card "Pendentes de validação" com badge "2" e outro "Já validados" com "1".
    const cards = screen.getAllByText(/^\d+$/);
    expect(cards.map(el => el.textContent)).toEqual(expect.arrayContaining(['2', '1']));
  });
});
