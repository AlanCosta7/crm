/**
 * postLoginLanding.test.tsx — Fase 2.4 do PLANO_DESENHO_CRM.md
 *
 * Slide 9: "O SDR abriu o CRM e a primeira página é a de Atividades com o Bloco
 * de Horários." O desvio é de UMA VEZ, logo após o login — se fosse permanente,
 * o item Dashboard da sidebar ficaria inalcançável para o SDR.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostLoginLanding, POST_LOGIN_FLAG } from './PostLoginLanding';
import type { UserRole } from '../../types/crm';

// O componente desvia com <Navigate>, não com useNavigate() — o stub registra
// o destino para as asserções.
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => {
    navigate(to, { replace });
    return null;
  },
}));

const mockAuth = vi.fn();
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => mockAuth() }));

function comPapel(role: UserRole) {
  mockAuth.mockReturnValue({ user: { uid: `uid-${role}`, role, tenantId: 'wizmart_sp' } });
}

const Conteudo = () => <div>DASHBOARD</div>;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('PostLoginLanding', () => {
  it('SDR recém-logado é levado para a fila do dia', () => {
    sessionStorage.setItem(POST_LOGIN_FLAG, '1');
    comPapel('sdr');
    render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(navigate).toHaveBeenCalledWith('/activities', { replace: true });
  });

  it('e o Dashboard não é pintado no caminho', () => {
    sessionStorage.setItem(POST_LOGIN_FLAG, '1');
    comPapel('sdr');
    render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(screen.queryByText('DASHBOARD')).toBeNull();
  });

  // Sem esta parte, o item Dashboard da sidebar ficaria inalcançável pro SDR.
  it('SDR navegando para o Dashboard depois do login NÃO é desviado', () => {
    comPapel('sdr'); // sem a marca — navegação normal
    render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('a marca é consumida: um segundo acesso já não desvia', () => {
    sessionStorage.setItem(POST_LOGIN_FLAG, '1');
    comPapel('sdr');
    const { unmount } = render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(navigate).toHaveBeenCalledTimes(1);
    unmount();

    navigate.mockClear();
    render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it.each<UserRole>(['master', 'manager', 'bdr', 'rep', 'viewer'])(
    '%s recém-logado continua caindo no Dashboard',
    (role) => {
      sessionStorage.setItem(POST_LOGIN_FLAG, '1');
      comPapel(role);
      render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    },
  );

  it('sem usuário carregado, não decide nada ainda', () => {
    sessionStorage.setItem(POST_LOGIN_FLAG, '1');
    mockAuth.mockReturnValue({ user: null });
    render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
    expect(navigate).not.toHaveBeenCalled();
    // A marca continua lá para quando o papel resolver.
    expect(sessionStorage.getItem(POST_LOGIN_FLAG)).toBe('1');
  });

  it('storage bloqueado não quebra a tela — cai no Dashboard', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage bloqueado'); },
    });
    try {
      comPapel('sdr');
      render(<PostLoginLanding><Conteudo /></PostLoginLanding>);
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});
