import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ViewAsModal } from './ViewAsModal';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { startImpersonation } from '../../features/auth/impersonation';
import type { SettingUser } from '../../types/crm';

vi.mock('../../config/firebase', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('../../hooks/useFirestore', () => ({ useFirestoreCollection: vi.fn() }));
vi.mock('../../features/auth/impersonation', () => ({ startImpersonation: vi.fn() }));

const mockUseFirestoreCollection = vi.mocked(useFirestoreCollection);
const mockStartImpersonation = vi.mocked(startImpersonation);
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const users: SettingUser[] = [
  { id: 'master-001', name: 'Ricardo Master', email: 'master@wizmart.com.br', initials: 'RM', color: '#1A6B1A', role: 'master', last: '' },
  { id: 'manager-001', name: 'Fernanda Gestora', email: 'manager@wizmart.com.br', initials: 'FG', color: '#0E7490', role: 'manager', last: '' },
  { id: 'sdr-001', name: 'João SDR', email: 'sdr@wizmart.com.br', initials: 'JS', color: '#B45309', role: 'sdr', last: '' },
  { id: 'sdr-002', name: 'Mariana SDR', email: 'sdr2@wizmart.com.br', initials: 'MS', color: '#D97706', role: 'sdr', last: '' },
  { id: 'rep-001', name: 'Carla Rep', email: 'rep@wizmart.com.br', initials: 'CR', color: '#B91C1C', role: 'rep', last: '', isActive: false },
];

const setup = () => {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <ViewAsModal onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose };
};

beforeEach(() => {
  mockUseFirestoreCollection.mockReturnValue({ data: users, loading: false, error: null } as never);
  mockStartImpersonation.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
  useAuthStore.setState({
    user: { uid: 'master-001', name: 'Ricardo Master', email: 'master@wizmart.com.br', initials: 'RM', color: '#1A6B1A', role: 'master', tenantId: 'wizmart' },
    loading: false,
  } as never);
});

describe('ViewAsModal — listagem', () => {
  it('agrupa por perfil e nunca lista o próprio master', () => {
    setup();
    expect(screen.queryByText('Ricardo Master')).not.toBeInTheDocument();
    expect(screen.getByText('Gestor')).toBeInTheDocument();
    expect(screen.getByText('SDR')).toBeInTheDocument();
    expect(screen.getByText('João SDR')).toBeInTheDocument();
    expect(screen.getByText('Mariana SDR')).toBeInTheDocument();
  });

  it('não lista usuário desativado', () => {
    setup();
    expect(screen.queryByText('Carla Rep')).not.toBeInTheDocument();
  });

  it('mostra estado de carregamento', () => {
    mockUseFirestoreCollection.mockReturnValue({ data: [], loading: true, error: null } as never);
    setup();
    expect(screen.getByText(/carregando usuários/i)).toBeInTheDocument();
  });

  it('mensagem vazia quando não há ninguém para listar', () => {
    mockUseFirestoreCollection.mockReturnValue({ data: [], loading: false, error: null } as never);
    setup();
    expect(screen.getByText(/nenhum usuário encontrado/i)).toBeInTheDocument();
  });
});

describe('ViewAsModal — busca', () => {
  it('filtra por nome ignorando acento e caixa', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Buscar usuário'), 'JOAO');

    expect(screen.getByText('João SDR')).toBeInTheDocument();
    expect(screen.queryByText('Mariana SDR')).not.toBeInTheDocument();
  });

  it('filtra por e-mail', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Buscar usuário'), 'sdr2@');

    expect(screen.getByText('Mariana SDR')).toBeInTheDocument();
    expect(screen.queryByText('João SDR')).not.toBeInTheDocument();
  });

  it('busca sem resultado mostra o estado vazio', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Buscar usuário'), 'zzz');
    expect(screen.getByText(/nenhum usuário encontrado/i)).toBeInTheDocument();
  });
});

describe('ViewAsModal — escolher alguém', () => {
  it('inicia a impersonação, fecha o modal e navega para o dashboard', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByText('João SDR'));

    await waitFor(() => expect(mockStartImpersonation).toHaveBeenCalledWith('sdr-001', 'Ricardo Master'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('mostra "Entrando..." no card enquanto a troca de sessão está em curso', async () => {
    let resolve!: () => void;
    mockStartImpersonation.mockReturnValue(new Promise(r => { resolve = r; }));
    setup();

    await userEvent.click(screen.getByText('João SDR'));
    expect(screen.getByText('Entrando...')).toBeInTheDocument();

    resolve();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it('erro de permissão mostra mensagem específica e reabilita a lista', async () => {
    mockStartImpersonation.mockRejectedValue(new Error('permission-denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup();

    await userEvent.click(screen.getByText('João SDR'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sem permissão/i);
    expect(screen.queryByText('Entrando...')).not.toBeInTheDocument();
  });

  it('outros erros mostram mensagem genérica', async () => {
    mockStartImpersonation.mockRejectedValue(new Error('network offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup();

    await userEvent.click(screen.getByText('João SDR'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível iniciar/i);
  });

  it('clicar fora ou no X fecha sem chamar a function', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
    expect(mockStartImpersonation).not.toHaveBeenCalled();
  });
});
