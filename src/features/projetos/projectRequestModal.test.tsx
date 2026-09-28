/**
 * projectRequestModal.test.tsx — Formulário de Solicitação de Projeto
 * (PLANO_DESENHO_CRM_2, A2/A3): rótulos e teto do Word, e bloqueio do envio
 * enquanto houver arquivo subindo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectRequestModal } from './ProjectRequestModal';

const { setDocMock, uploadState } = vi.hoisted(() => ({
  setDocMock: vi.fn().mockResolvedValue(undefined),
  uploadState: { busy: false, attachments: [] as any[], uploads: [] as any[] },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'req-novo' })),
  setDoc: setDocMock,
  serverTimestamp: vi.fn(() => 'TS'),
}));
vi.mock('../../config/firebase', () => ({ db: {}, storage: {} }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'rep-1', name: 'Carla Rep', role: 'rep', tenantId: 't1' } }),
}));
vi.mock('./useProjectUpload', () => ({
  useProjectUpload: () => ({ ...uploadState, addFiles: vi.fn(), remove: vi.fn() }),
}));

const deal: any = { id: 'd1', company: 'CSN', productId: 'wizmart' };

function abrirAte(passo: 2 | 3) {
  fireEvent.click(screen.getByText('Nanomarket'));
  fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
  if (passo === 3) {
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Quantidade de Gôndola' }));
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadState.busy = false;
  uploadState.attachments = [];
  uploadState.uploads = [];
});

describe('ProjectRequestModal', () => {
  it('tipo de PDV com os nomes do cliente: Nanomarket, Micromarket, Loja, Container', () => {
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    for (const n of ['Nanomarket', 'Micromarket', 'Loja', 'Container']) expect(screen.getByText(n)).toBeInTheDocument();
    expect(screen.queryByText('Loja Física')).toBeNull();
  });

  it('equipamentos com os rótulos exatos do Word', () => {
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    abrirAte(2);
    for (const l of ['Luminária WizMart', 'Letreiro WizMart', 'Quantidade de Freezer Horizontal — Picolé', 'Quantidade de Gôndola']) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it('quantidade trava em 10: o "+" desabilita', () => {
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    abrirAte(2);
    const mais = screen.getByRole('button', { name: 'Aumentar Luminária WizMart' });
    for (let i = 0; i < 12; i++) fireEvent.click(mais);
    expect(mais).toBeDisabled();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('não avança sem ao menos um equipamento', () => {
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    abrirAte(2);
    expect(screen.getByRole('button', { name: /Próximo/ })).toBeDisabled();
  });

  it('envia com o id gerado antes, o papel real e os anexos', async () => {
    uploadState.attachments = [{ id: 'a1', url: 'https://x/f.jpg', name: 'f.jpg', kind: 'image' }];
    const onClose = vi.fn();
    render(<ProjectRequestModal deal={deal} onClose={onClose} />);
    abrirAte(3);
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitação/ }));
    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const payload = setDocMock.mock.calls[0][1];
    expect(payload).toMatchObject({ dealId: 'd1', requestedBy: 'rep-1', requestedByRole: 'rep', status: 'pending' });
    expect(payload.attachments).toHaveLength(1);
    expect(payload.mediaUrls).toEqual(['https://x/f.jpg']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('enquanto há arquivo subindo, o envio fica bloqueado', () => {
    uploadState.busy = true;
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    abrirAte(3);
    expect(screen.getByRole('button', { name: /Enviando arquivos/ })).toBeDisabled();
  });

  it('o passo 3 oferece anexar fotos e vídeos (não é mais "em breve")', () => {
    render(<ProjectRequestModal deal={deal} onClose={() => {}} />);
    abrirAte(3);
    expect(screen.getByText('Anexar fotos e vídeos')).toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).toBeNull();
  });
});
