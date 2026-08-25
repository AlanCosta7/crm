/**
 * useLeaderboard.test.ts — Testes do hook do Leaderboard Gamificado
 *
 * Cobre: conexão com Firebase Realtime Database, conversão de formato de dados
 * (objeto vs array), ordenação decrescente por pontos (pts), recalculação
 * de posições do ranking, tratamento de erros e limpeza de listeners (off).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLeaderboard } from './useLeaderboard';
import { useAuthStore } from '../stores/authStore';
import { ref, onValue, off } from 'firebase/database';

// Mock das dependências externas
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  off: vi.fn(),
}));

vi.mock('../config/firebase', () => ({
  rtdb: {},
}));

describe('useLeaderboard — hook de ranking em tempo real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar vazio imediatamente se o usuário não tiver tenantId', () => {
    (useAuthStore as any).mockReturnValue({
      user: null, // Sem usuário / Sem tenantId
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(onValue).not.toHaveBeenCalled();
  });

  it('deve se inscrever no Realtime Database quando o usuário tiver tenantId', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.loading).toBe(true);
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'tenants/tenant_sp/leaderboard');
    expect(onValue).toHaveBeenCalled();
  });

  it('deve processar e ordenar corretamente quando o RTDB retornar dados em formato de Array', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    let callback: any;
    (onValue as any).mockImplementation((_ref: any, cb: any) => {
      callback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useLeaderboard());

    // Dados não ordenados vindo do RTDB
    const mockArrayData = [
      null, // índice 0 nulo para simular comportamento de array esparso do FB
      { id: 'u1', name: 'João SDR', pts: 100, coinBalance: 5 },
      { id: 'u2', name: 'Carla Rep', pts: 350, coinBalance: 15 },
      { id: 'u3', name: 'Maria BDR', pts: 200, coinBalance: 10 },
    ];

    const mockSnapshot = {
      val: () => mockArrayData,
    };

    // Aciona o callback do listener (act: flush do setState no React 19)
    act(() => callback(mockSnapshot));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(3);

    // O primeiro deve ser Carla (350 pts), seguida por Maria (200 pts) e João (100 pts)
    expect(result.current.data[0].id).toBe('u2');
    expect(result.current.data[0].rank).toBe(1);
    expect(result.current.data[0].name).toBe('Carla Rep');

    expect(result.current.data[1].id).toBe('u3');
    expect(result.current.data[1].rank).toBe(2);

    expect(result.current.data[2].id).toBe('u1');
    expect(result.current.data[2].rank).toBe(3);
    
    // Testa fallbacks de propriedades indefinidas
    const jesse = result.current.data[2];
    expect(jesse.level).toBe('Jr');
    expect(jesse.streak).toBe(0);
    expect(jesse.trend).toBe(0);
  });

  it('deve processar e ordenar corretamente quando o RTDB retornar dados em formato de Objeto (Map)', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    let callback: any;
    (onValue as any).mockImplementation((_ref: any, cb: any) => {
      callback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useLeaderboard());

    // Dados em formato de objeto associativo
    const mockObjectData = {
      user_alpha: { name: 'Alpha', pts: 150 },
      user_beta: { name: 'Beta', pts: 500, level: 'Sr' },
    };

    const mockSnapshot = {
      val: () => mockObjectData,
    };

    act(() => callback(mockSnapshot));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(2);

    // Beta em primeiro (500 pts), Alpha em segundo (150 pts)
    expect(result.current.data[0].id).toBe('user_beta');
    expect(result.current.data[0].rank).toBe(1);
    expect(result.current.data[0].level).toBe('Sr');

    expect(result.current.data[1].id).toBe('user_alpha');
    expect(result.current.data[1].rank).toBe(2);
  });

  it('deve limpar os dados se o snapshot retornar nulo', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    let callback: any;
    (onValue as any).mockImplementation((_ref: any, cb: any) => {
      callback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useLeaderboard());

    act(() => callback({ val: () => null }));

    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('deve tratar erros vindo do Firebase e preencher o estado de erro', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    let errorHandler: any;
    (onValue as any).mockImplementation((_ref: any, _cb: any, errCb: any) => {
      errorHandler = errCb;
      return () => {};
    });

    const { result } = renderHook(() => useLeaderboard());

    const mockError = new Error('Permissão negada no RTDB');
    
    // Espiona logs de console.error
    const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Dispara o erro no listener
    act(() => errorHandler(mockError));

    expect(result.current.error).toBe(mockError);
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(spyError).toHaveBeenCalled();

    spyError.mockRestore();
  });

  it('deve desinscrever o listener no cleanup do hook (off)', () => {
    (useAuthStore as any).mockReturnValue({
      user: { tenantId: 'tenant_sp' },
    });

    const { unmount } = renderHook(() => useLeaderboard());

    expect(off).not.toHaveBeenCalled();

    // Desmonta o hook
    unmount();

    expect(off).toHaveBeenCalledTimes(1);
  });
});
