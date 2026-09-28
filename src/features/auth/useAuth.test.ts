/**
 * useAuth.test.ts — Testes unitários para o hook global de autenticação (useAuth)
 *
 * Cobre:
 * 1. Sincronização do estado do usuário no login com custom claims do Firebase (tenantId, role).
 * 2. Assinatura em tempo real (onSnapshot) do perfil no Firestore para atualizar moedas, pontos e exibir Toasts.
 * 3. A salvaguarda do usuário mock para testes E2E (não limpa o usuário se o estado do Zustand estiver preenchido mas o Firebase retornar null).
 * 4. O fluxo de logout funcionando perfeitamente (quando o estado é limpo previamente e o Firebase desloga).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';

// Mock do Firebase Auth
let authStateChangedCallback: any = null;
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    authStateChangedCallback = callback;
    return () => {};
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

// Mock do Firebase Firestore
let snapshotCallback: any = null;
vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue({ id: 'mock-doc-ref' }),
  onSnapshot: vi.fn((_ref, callback) => {
    snapshotCallback = callback;
    return () => {};
  }),
}));

// Mock do módulo config/firebase
vi.mock('../../config/firebase', () => ({
  auth: {},
  db: {},
}));

describe('useAuth hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateChangedCallback = null;
    snapshotCallback = null;
    
    // Reseta os estados dos stores Zustand
    useAuthStore.setState({ user: null, loading: true });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve registrar o listener de estado do Firebase Auth no mount', () => {
    renderHook(() => useAuth());
    expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('deve atualizar o store para null e loading false quando o Firebase retornar null e o store estiver vazio', () => {
    renderHook(() => useAuth());
    
    // Dispara evento do Firebase Auth sem usuário
    authStateChangedCallback(null);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('deve reter o usuário mock do Zustand se o Firebase retornar null mas o store já tiver um usuário (salvaguarda E2E)', () => {
    // Configura um usuário pré-existente no store (como feito em testes E2E/mock)
    const mockUser: any = { uid: 'e2e-user', name: 'Mock E2E', role: 'master', tenantId: 'wizmart_sp' };
    useAuthStore.setState({ user: mockUser, loading: false });

    renderHook(() => useAuth());

    // Dispara evento do Firebase Auth retornando null (ex: primeira verificação assíncrona no mount)
    authStateChangedCallback(null);

    // O usuário mock deve continuar intacto no store!
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('deve assinar o documento do Firestore ao logar com sucesso e atualizar o Zustand com as informações do banco', async () => {
    renderHook(() => useAuth());

    // Mock do Firebase User com token decodificado contendo as claims
    const mockFirebaseUser: any = {
      uid: 'user-123',
      email: 'vendedor@wizmart.com.br',
      displayName: 'João Vendedor',
      getIdTokenResult: vi.fn().mockResolvedValue({
        claims: {
          tenantId: 'wizmart_sp',
          role: 'sdr',
        },
      }),
    };

    // Dispara login no Firebase Auth
    await authStateChangedCallback(mockFirebaseUser);

    // Deve iniciar a escuta do Firestore
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    // Simula resposta do documento do usuário no Firestore
    const mockUserSnap: any = {
      exists: () => true,
      data: () => ({
        name: 'João Modificado',
        color: '#ff0000',
        initials: 'JM',
        points: 120,
        coinBalance: 50,
        streak: 3,
        productIds: ['wizmart', 'smart_cafe'],
        calendarConnected: true,
      }),
    };

    // Dispara o snapshot callback do Firestore
    snapshotCallback(mockUserSnap);

    // Verifica se os dados do Firestore e do Auth token foram sincronizados no Zustand
    expect(useAuthStore.getState().user).toEqual({
      uid: 'user-123',
      name: 'João Modificado',
      email: 'vendedor@wizmart.com.br',
      initials: 'JM',
      color: '#ff0000',
      role: 'sdr',
      tenantId: 'wizmart_sp',
      coinBalance: 50,
      points: 120,
      streak: 3,
      productIds: ['wizmart', 'smart_cafe'],
      calendarConnected: true,
    });
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('deve disparar toasts de gamificação quando pontos ou moedas aumentarem no Firestore', async () => {
    renderHook(() => useAuth());

    const mockFirebaseUser: any = {
      uid: 'user-123',
      email: 'vendedor@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({
        claims: { tenantId: 'wizmart_sp', role: 'sdr' },
      }),
    };

    await authStateChangedCallback(mockFirebaseUser);

    // Primeiro snapshot (estado inicial)
    snapshotCallback({
      exists: () => true,
      data: () => ({ name: 'João', points: 100, coinBalance: 10 }),
    });

    // Segundo snapshot com incremento de pontos (+20) e moedas (+5)
    snapshotCallback({
      exists: () => true,
      data: () => ({ name: 'João', points: 120, coinBalance: 15 }),
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toMatchObject({
      type: 'points',
      message: 'Pontos Ganhos! ⚡',
      pointsAmount: 20,
    });
    expect(toasts[1]).toMatchObject({
      type: 'coins',
      message: 'Moedas Adicionadas! 🪙',
      coinsAmount: 5,
    });
  });

  it('deve realizar logout com sucesso quando o estado é previamente limpo via handleLogout', () => {
    // Configura o usuário atual como ativo no store
    const mockUser: any = { uid: 'user-123', name: 'João', role: 'sdr', tenantId: 'wizmart_sp' };
    useAuthStore.setState({ user: mockUser, loading: false });

    renderHook(() => useAuth());

    // Simula o clique em sair (handleLogout faz setUser(null) no Zustand e auth.signOut() no Firebase)
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();

    // Firebase Auth então notifica a mudança de sessão para null
    authStateChangedCallback(null);

    // O estado deve permanecer null e loading false
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });
  // ── Fase 0 do PLANO_DESENHO_CRM.md ─────────────────────────────────────────
  it('conta sem claim de papel cai em viewer — NUNCA em master', async () => {
    renderHook(() => useAuth());

    const semPapel: any = {
      uid: 'sem-claim',
      email: 'orfao@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({
        claims: { tenantId: 'wizmart_sp' }, // sem `role`
      }),
    };

    await authStateChangedCallback(semPapel);
    snapshotCallback({ exists: () => true, data: () => ({ name: 'Órfão' }) });

    expect(useAuthStore.getState().user?.role).toBe('viewer');
  });

  it('papel vazio no token também cai em viewer', async () => {
    renderHook(() => useAuth());

    const papelVazio: any = {
      uid: 'claim-vazia',
      email: 'vazio@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({
        claims: { tenantId: 'wizmart_sp', role: '' },
      }),
    };

    await authStateChangedCallback(papelVazio);
    snapshotCallback({ exists: () => true, data: () => ({ name: 'Vazio' }) });

    expect(useAuthStore.getState().user?.role).toBe('viewer');
  });

  it('avisa o usuário quando o servidor encerra a sessão por mudança de permissão', async () => {
    renderHook(() => useAuth());

    const tokenRevogado: any = {
      uid: 'user-123',
      email: 'vendedor@wizmart.com.br',
      getIdTokenResult: vi.fn().mockRejectedValue(
        Object.assign(new Error('token revogado'), { code: 'auth/user-token-expired' }),
      ),
    };

    await authStateChangedCallback(tokenRevogado);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      type: 'info',
      message: 'Sua sessão foi encerrada',
    });
  });

  it('avisa com texto específico quando o acesso foi desativado pela administração', async () => {
    renderHook(() => useAuth());

    const contaBloqueada: any = {
      uid: 'bloqueado',
      email: 'dispensado@wizmart.com.br',
      getIdTokenResult: vi.fn().mockRejectedValue(
        Object.assign(new Error('conta desabilitada'), { code: 'auth/user-disabled' }),
      ),
    };

    await authStateChangedCallback(contaBloqueada);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useToastStore.getState().toasts[0]?.sub).toContain('desativado');
  });

  // ── Fase 6.1 do PLANO_DESENHO_CRM.md — "Encerrar Sessão" ao vivo ───────────
  // Comparação é contra o ÚLTIMO valor visto NESTA sessão do listener — não
  // contra `lastSignInTime` do Firebase Auth (não confiável no emulador). A
  // 1ª leitura só grava a base; qualquer MUDANÇA depois é um encerramento ao
  // vivo, mesmo padrão já usado abaixo para o delta de pontos/moedas.
  it('forceLogoutAt aparecendo DEPOIS da 1ª leitura desta sessão força signOut() na hora', async () => {
    renderHook(() => useAuth());

    const usuario: any = {
      uid: 'sdr-derrubado',
      email: 'sdr@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { tenantId: 'wizmart_sp', role: 'sdr' } }),
    };
    await authStateChangedCallback(usuario);

    // 1ª leitura desta sessão: sem forceLogoutAt — só estabelece a base.
    snapshotCallback({ exists: () => true, data: () => ({ name: 'João SDR' }) });
    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.uid).toBe('sdr-derrubado');

    // 2ª leitura: admin encerrou a sessão AGORA, enquanto o listener já estava aberto.
    snapshotCallback({
      exists: () => true,
      data: () => ({ name: 'João SDR', forceLogoutAt: { toMillis: () => 1_757_670_300_000 } }),
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      type: 'info',
      message: 'Sua sessão foi encerrada',
    });
    // Regressão real de QA manual: sem `setUser(null)` aqui, quando o Firebase
    // Auth disparasse `onAuthStateChanged(null)` (assíncrono, depois deste
    // teste), a salvaguarda de mock do E2E via `useAuthStore.getState().user
    // !== null` achava que era um usuário mockado e MANTINHA a sessão velha —
    // o app nunca voltava pro login. `setUser(null)` precisa acontecer AQUI,
    // síncrono, antes do `signOut()` assíncrono resolver.
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('forceLogoutAt já presente na 1ª leitura (encerramento antigo, de antes deste login) NÃO derruba a sessão nova', async () => {
    renderHook(() => useAuth());

    const usuario: any = {
      uid: 'sdr-novo-login',
      email: 'sdr@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { tenantId: 'wizmart_sp', role: 'sdr' } }),
    };
    await authStateChangedCallback(usuario);

    // A 1ª leitura já vem com forceLogoutAt de um encerramento ANTERIOR a este
    // login — é só a base da sessão nova, não deve derrubar ninguém.
    snapshotCallback({
      exists: () => true,
      data: () => ({ name: 'João SDR', points: 10, coinBalance: 0, forceLogoutAt: { toMillis: () => 1_757_670_300_000 } }),
    });
    expect(signOut).not.toHaveBeenCalled();

    // Escritas subsequentes com o MESMO valor (ex.: ganhar moeda) também não disparam.
    snapshotCallback({
      exists: () => true,
      data: () => ({ name: 'João SDR', points: 10, coinBalance: 5, forceLogoutAt: { toMillis: () => 1_757_670_300_000 } }),
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.uid).toBe('sdr-novo-login');
  });

  it('sem forceLogoutAt em nenhuma leitura, comportamento normal — nenhum signOut', async () => {
    renderHook(() => useAuth());

    const usuario: any = {
      uid: 'user-comum',
      email: 'rep@wizmart.com.br',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { tenantId: 'wizmart_sp', role: 'rep' } }),
    };
    await authStateChangedCallback(usuario);

    snapshotCallback({ exists: () => true, data: () => ({ name: 'Carla Rep' }) });
    snapshotCallback({ exists: () => true, data: () => ({ name: 'Carla Rep', points: 5 }) });

    expect(signOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.uid).toBe('user-comum');
  });
});
