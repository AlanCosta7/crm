import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useImpersonationSession } from '../../features/auth/useImpersonationSession';
import { stopImpersonation } from '../../features/auth/impersonation';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../config/firebase', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('../../features/auth/useImpersonationSession', () => ({ useImpersonationSession: vi.fn() }));
vi.mock('../../features/auth/impersonation', () => ({ stopImpersonation: vi.fn() }));

const mockSession = vi.mocked(useImpersonationSession);
const mockStop = vi.mocked(stopImpersonation);
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const setup = () => render(<MemoryRouter><ImpersonationBanner /></MemoryRouter>);

beforeEach(() => {
  mockNavigate.mockReset();
  mockStop.mockReset();
  useAuthStore.setState({
    user: { uid: 'sdr-001', name: 'João SDR', email: 'sdr@wizmart.com.br', initials: 'JS', color: '#B45309', role: 'sdr', tenantId: 'wizmart' },
    loading: false,
  } as never);
});

describe('ImpersonationBanner — visibilidade', () => {
  it('não renderiza nada fora de uma impersonação', () => {
    mockSession.mockReturnValue(null);
    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra quem está sendo visto e quem começou a sessão', () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    setup();

    expect(screen.getByText('João SDR')).toBeInTheDocument();
    expect(screen.getByText(/\(SDR\) — iniciado por Ricardo Master/)).toBeInTheDocument();
  });

  it('traduz o role para o rótulo em português', () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    useAuthStore.setState({
      user: { uid: 'viewer-001', name: 'Paulo Viewer', email: 'v@x.com', initials: 'PV', color: '#000', role: 'viewer', tenantId: 'wizmart' },
      loading: false,
    } as never);
    setup();
    expect(screen.getByText(/Visualizador/)).toBeInTheDocument();
  });
});

describe('ImpersonationBanner — voltar', () => {
  it('sucesso via bilhete não navega — a troca de sessão já refaz a UI', async () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    mockStop.mockResolvedValue('returned');
    setup();

    await userEvent.click(screen.getByRole('button', { name: /voltar para admin/i }));

    await waitFor(() => expect(mockStop).toHaveBeenCalledWith('sdr-001'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('fallback sem bilhete navega para /login com o aviso', async () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    mockStop.mockResolvedValue('signed-out');
    setup();

    await userEvent.click(screen.getByRole('button', { name: /voltar para admin/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { impersonationEnded: true } })
    );
  });

  it('mostra "Voltando..." e desabilita o botão durante a operação', async () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    let resolve!: (v: 'returned') => void;
    mockStop.mockReturnValue(new Promise(r => { resolve = r; }));
    setup();

    const btn = screen.getByRole('button', { name: /voltar para admin/i });
    await userEvent.click(btn);

    expect(screen.getByRole('button', { name: /voltando/i })).toBeDisabled();
    resolve('returned');
    await waitFor(() => expect(mockStop).toHaveBeenCalled());
  });

  it('erro inesperado reabilita o botão em vez de travar', async () => {
    mockSession.mockReturnValue({ actorUid: 'master-001', actorName: 'Ricardo Master' });
    mockStop.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup();

    await userEvent.click(screen.getByRole('button', { name: /voltar para admin/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /voltar para admin/i })).toBeEnabled());
  });
});
