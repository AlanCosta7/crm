import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useImpersonationSession } from './useImpersonationSession';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => args.join('/')),
  onSnapshot: vi.fn(),
}));

const mockOnSnapshot = vi.mocked(onSnapshot);

const setUser = (uid?: string, tenantId?: string) => {
  useAuthStore.setState({
    user: uid ? { uid, name: 'x', email: 'x', initials: 'X', color: '#000', role: 'sdr', tenantId } : null,
    loading: false,
  } as never);
};

beforeEach(() => {
  mockOnSnapshot.mockReset();
});

describe('useImpersonationSession', () => {
  it('sem uid/tenantId, não assina nada e devolve null', () => {
    setUser(undefined, undefined);
    const { result } = renderHook(() => useImpersonationSession());
    expect(result.current).toBeNull();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('sem o doc, devolve null', async () => {
    setUser('sdr-001', 'wizmart');
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      (onNext as (s: unknown) => void)({ exists: () => false });
      return vi.fn();
    });
    const { result } = renderHook(() => useImpersonationSession());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('com o doc, expõe quem está impersonando', async () => {
    setUser('sdr-001', 'wizmart');
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      (onNext as (s: unknown) => void)({
        exists: () => true,
        data: () => ({ actorUid: 'master-001', actorName: 'Ricardo Master', startedAt: 'ts' }),
      });
      return vi.fn();
    });
    const { result } = renderHook(() => useImpersonationSession());
    await waitFor(() =>
      expect(result.current).toEqual({ actorUid: 'master-001', actorName: 'Ricardo Master', startedAt: 'ts' })
    );
  });

  it('usa nome padrão quando actorName vem vazio', async () => {
    setUser('sdr-001', 'wizmart');
    mockOnSnapshot.mockImplementation((_ref, onNext) => {
      (onNext as (s: unknown) => void)({
        exists: () => true,
        data: () => ({ actorUid: 'master-001', actorName: '' }),
      });
      return vi.fn();
    });
    const { result } = renderHook(() => useImpersonationSession());
    await waitFor(() => expect(result.current?.actorName).toBe('Admin Master'));
  });

  it('cancela a assinatura anterior e limpa o estado ao trocar de uid (logout)', () => {
    setUser('sdr-001', 'wizmart');
    const unsub = vi.fn();
    mockOnSnapshot.mockReturnValue(unsub);

    const { result, rerender } = renderHook(() => useImpersonationSession());

    setUser(undefined, undefined);
    rerender();

    expect(unsub).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('erro na assinatura não derruba o hook nem lança', () => {
    setUser('sdr-001', 'wizmart');
    mockOnSnapshot.mockImplementation((_ref, _onNext, onError) => {
      (onError as unknown as (e: Error) => void)(new Error('offline'));
      return vi.fn();
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => renderHook(() => useImpersonationSession())).not.toThrow();
  });
});
