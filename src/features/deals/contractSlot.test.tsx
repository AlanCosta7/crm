/**
 * contractSlot.test.tsx — ContractSlot (Fase 5.4)
 *
 * O que mais importa: o slot só existe para Comodato Smart Café, o rótulo de
 * status bate com `contractStatus.ts`, e um arquivo que não é PDF é recusado
 * ANTES de qualquer upload — nunca chega a chamar o Storage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContractSlot } from './ContractSlot';
import type { Deal } from '../../types/crm';

const uploadBytesResumable = vi.fn();
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytesResumable: (...args: unknown[]) => uploadBytesResumable(...args),
  getDownloadURL: vi.fn(async () => 'https://storage/contrato.pdf'),
}));
vi.mock('../../config/firebase', () => ({ storage: {}, db: {}, auth: {}, rtdb: {}, functions: {} }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'rep-1', tenantId: 'wizmart_sp', role: 'rep' } }),
}));

const updateDocument = vi.fn();
vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreMutations: () => ({ updateDocument }),
}));

function comodato(over: Partial<Deal> = {}): Deal {
  return {
    id: 'd1', name: 'Franquia X', company: 'Franquia X LTDA', value: 0, stage: 'contrato_assinado',
    productId: 'smart_cafe', mainProduct: 'smartcafe_comodato', owner: 'rep-1', due: '—',
    tasks: { e: false, w: false, m: false },
    ...over,
  } as Deal;
}

const pdfFile = () => new File(['%PDF-1.4'], 'contrato.pdf', { type: 'application/pdf' });
const txtFile = () => new File(['oi'], 'nao-e-contrato.txt', { type: 'text/plain' });

function inputEl(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('ContractSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nada para um deal que não é Comodato', () => {
    const { container } = render(<ContractSlot deal={comodato({ mainProduct: 'wizmart_minimercado' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem contrato, mostra o status "Sem contrato anexado"', () => {
    render(<ContractSlot deal={comodato()} />);
    expect(screen.getByText('Sem contrato anexado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anexar PDF do contrato/ })).toBeInTheDocument();
  });

  it('com contrato e sem pagamento, mostra "Aguardando validação do financeiro"', () => {
    const deal = comodato({
      contract: { url: 'https://x', storagePath: 'p', fileName: 'contrato-assinado.pdf', mime: 'application/pdf', size: 100, uploadedBy: 'rep-1', uploadedAt: new Date() },
    });
    render(<ContractSlot deal={deal} />);
    expect(screen.getByText('Aguardando validação do financeiro')).toBeInTheDocument();
    expect(screen.getByText('contrato-assinado.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Substituir PDF/ })).toBeInTheDocument();
    // Explica de onde vem a validação — nenhum botão de "confirmar pagamento" aqui.
    expect(screen.getByText(/o financeiro recebe um lembrete/)).toBeInTheDocument();
  });

  it('pago, mostra "Pagamento confirmado"', () => {
    const deal = comodato({
      contract: { url: 'https://x', storagePath: 'p', fileName: 'contrato.pdf', mime: 'application/pdf', size: 100, uploadedBy: 'rep-1', uploadedAt: new Date() },
      contractPaidAt: new Date(),
    });
    render(<ContractSlot deal={deal} />);
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  });

  it('nunca renderiza um botão de confirmar pagamento — isso é só do financeiro', () => {
    const deal = comodato({ contract: { url: 'https://x', storagePath: 'p', fileName: 'c.pdf', mime: 'application/pdf', size: 1, uploadedBy: 'rep-1', uploadedAt: new Date() } });
    render(<ContractSlot deal={deal} />);
    expect(screen.queryByRole('button', { name: /pagamento/i })).toBeNull();
  });

  it('arquivo que não é PDF é recusado antes de qualquer upload', async () => {
    const { container } = render(<ContractSlot deal={comodato()} />);
    fireEvent.change(inputEl(container), { target: { files: [txtFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/precisa ser um PDF/)).toBeInTheDocument();
    });
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('PDF válido dispara o upload', async () => {
    uploadBytesResumable.mockReturnValue({
      on: (_event: string, _progress: unknown, _error: unknown, complete: () => void) => complete(),
      snapshot: { ref: {} },
    });

    const { container } = render(<ContractSlot deal={comodato()} />);
    fireEvent.change(inputEl(container), { target: { files: [pdfFile()] } });

    await waitFor(() => expect(uploadBytesResumable).toHaveBeenCalledOnce());
    await waitFor(() => expect(updateDocument).toHaveBeenCalledOnce());
    expect(updateDocument).toHaveBeenCalledWith('d1', expect.objectContaining({
      contract: expect.objectContaining({ fileName: 'contrato.pdf', uploadedBy: 'rep-1' }),
    }));
  });
});
