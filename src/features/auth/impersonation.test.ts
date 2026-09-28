import { describe, it, expect, beforeEach, vi } from 'vitest';

// O módulo importa `functions`/`auth` do config do Firebase logo no topo —
// sem o mock, cada teste inicializaria o SDK de verdade.
vi.mock('../../config/firebase', () => ({ auth: {}, functions: {} }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn(), signOut: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  readTicket,
  isTicketFresh,
  startImpersonation,
  stopImpersonation,
  type ImpersonationTicket,
} from './impersonation';

const STORAGE_KEY = 'wm_impersonation_return';
const mockSignIn = vi.mocked(signInWithCustomToken);
const mockSignOut = vi.mocked(signOut);
const mockHttpsCallable = vi.mocked(httpsCallable);

const ticket = (over: Partial<ImpersonationTicket> = {}): ImpersonationTicket => ({
  returnToken: 'tok123',
  targetUid: 'sdr-001',
  adminName: 'Ricardo Master',
  issuedAt: Date.now(),
  ...over,
});

beforeEach(() => sessionStorage.clear());

describe('readTicket', () => {
  it('lê um bilhete salvo', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket()));
    expect(readTicket()).toMatchObject({ targetUid: 'sdr-001', returnToken: 'tok123' });
  });

  it('devolve null sem nada salvo', () => {
    expect(readTicket()).toBeNull();
  });

  it('devolve null para JSON corrompido', () => {
    sessionStorage.setItem(STORAGE_KEY, '{não é json');
    expect(readTicket()).toBeNull();
  });

  it('devolve null para bilhete incompleto', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ returnToken: 'x' }));
    expect(readTicket()).toBeNull();
  });
});

describe('isTicketFresh', () => {
  it('considera fresco um bilhete recém-emitido', () => {
    const t = ticket({ issuedAt: Date.now() });
    expect(isTicketFresh(t, Date.now())).toBe(true);
  });

  it('considera vencido um bilhete com mais de 55 min', () => {
    const t = ticket({ issuedAt: Date.now() - 56 * 60 * 1000 });
    expect(isTicketFresh(t, Date.now())).toBe(false);
  });

  it('aceita margem logo abaixo do limite', () => {
    const t = ticket({ issuedAt: Date.now() - 54 * 60 * 1000 });
    expect(isTicketFresh(t, Date.now())).toBe(true);
  });
});

describe('startImpersonation', () => {
  beforeEach(() => {
    mockSignIn.mockReset().mockResolvedValue({} as never);
    mockHttpsCallable.mockReset();
  });

  it('guarda o bilhete de volta ANTES de trocar de sessão', async () => {
    const order: string[] = [];
    const impersonateFn = vi.fn().mockImplementation(async () => {
      order.push('called-function');
      return { data: { impersonationToken: 'imp-tok', returnToken: 'ret-tok', target: { uid: 'sdr-001', name: 'João', role: 'sdr' } } };
    });
    mockHttpsCallable.mockReturnValue(impersonateFn as never);
    mockSignIn.mockImplementation(async () => {
      order.push('signed-in');
      // Se o bilhete não estivesse salvo ANTES desta chamada, não haveria como
      // voltar caso a troca de sessão falhasse no meio.
      expect(readTicket()?.returnToken).toBe('ret-tok');
      return {} as never;
    });

    await startImpersonation('sdr-001', 'Ricardo Master');

    expect(order).toEqual(['called-function', 'signed-in']);
    expect(readTicket()).toMatchObject({ targetUid: 'sdr-001', returnToken: 'ret-tok', adminName: 'Ricardo Master' });
  });
});

describe('stopImpersonation', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockHttpsCallable.mockReset();
  });

  it('com bilhete fresco, volta direto para o Master sem deslogar', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket()));
    mockSignIn.mockResolvedValue({} as never);
    const endFn = vi.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(endFn as never);

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('returned');
    expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), 'tok123');
    expect(endFn).toHaveBeenCalledWith({ targetUid: 'sdr-001' });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(readTicket()).toBeNull();
  });

  it('sem bilhete salvo, limpa o marcador e desloga', async () => {
    const endFn = vi.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(endFn as never);

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('signed-out');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(endFn).toHaveBeenCalledWith({ targetUid: 'sdr-001' });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('bilhete vencido cai no fallback de logout', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket({ issuedAt: Date.now() - 60 * 60 * 1000 })));
    const endFn = vi.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(endFn as never);

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('signed-out');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('bilhete de outro uid (sessão trocada de mão) é ignorado — cai no fallback', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket({ targetUid: 'rep-002' })));
    const endFn = vi.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(endFn as never);

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('signed-out');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signInWithCustomToken falhar (token já usado/expirado no servidor) cai no fallback sem travar', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket()));
    mockSignIn.mockRejectedValue(new Error('auth/invalid-custom-token'));
    const endFn = vi.fn().mockResolvedValue({ data: { ok: true } });
    mockHttpsCallable.mockReturnValue(endFn as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('signed-out');
    expect(mockSignOut).toHaveBeenCalled();
    // dois pedidos de encerramento: o que tentou junto do retorno (não chegou
    // a rodar, pois o signIn falhou antes) e o do fallback
    expect(endFn).toHaveBeenCalledWith({ targetUid: 'sdr-001' });
  });

  it('mesmo se o próprio endImpersonation falhar no fallback, ainda desloga', async () => {
    const endFn = vi.fn().mockRejectedValue(new Error('offline'));
    mockHttpsCallable.mockReturnValue(endFn as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await stopImpersonation('sdr-001');

    expect(result).toBe('signed-out');
    expect(mockSignOut).toHaveBeenCalled();
  });
});
