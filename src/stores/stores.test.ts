/**
 * stores.test.ts — Testes das Zustand stores (authStore e uiStore)
 *
 * Valida que as stores inicializam corretamente e que as ações
 * de setState funcionam de forma previsível.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── authStore ─────────────────────────────────────────────────────────────────
describe('authStore', () => {
  let useAuthStore: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./authStore');
    useAuthStore = mod.useAuthStore;
    // Reseta o estado antes de cada teste
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setLoading(true);
  });

  it('inicia com user null e loading true', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(true);
  });

  it('setUser atualiza o usuário corretamente', () => {
    const user = {
      uid: 'u1', name: 'João SDR', email: 'sdr@wm.com',
      initials: 'JS', color: '#B45309', role: 'sdr' as const,
      tenantId: 'wizmart_sp', coinBalance: 10,
    };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user?.role).toBe('sdr');
    expect(useAuthStore.getState().user?.name).toBe('João SDR');
    expect(useAuthStore.getState().user?.coinBalance).toBe(10);
  });

  it('setUser com null limpa o estado', () => {
    useAuthStore.getState().setUser({ uid: 'u1', name: 'X', email: '', initials: '', color: '', role: 'viewer' as const, tenantId: '' });
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setLoading muda o flag de carregamento', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().loading).toBe(false);
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().loading).toBe(true);
  });

  it('aceita todos os 6 roles v2 sem erro', () => {
    const roles = ['master', 'manager', 'bdr', 'sdr', 'rep', 'viewer'] as const;
    for (const role of roles) {
      useAuthStore.getState().setUser({ uid: 'u', name: 'U', email: '', initials: '', color: '', role, tenantId: 'tid' });
      expect(useAuthStore.getState().user?.role).toBe(role);
    }
  });
});

// ── uiStore ───────────────────────────────────────────────────────────────────
describe('uiStore', () => {
  let useUIStore: any;

  beforeEach(async () => {
    vi.resetModules();
    // Garante localStorage limpo
    localStorage.clear();
    const mod = await import('./uiStore');
    useUIStore = mod.useUIStore;
  });

  it('inicia com productScope "all"', () => {
    expect(useUIStore.getState().productScope).toBe('all');
  });

  it('setProductId muda o produto e persiste no localStorage', () => {
    useUIStore.getState().setProductId('smart_cafe');
    expect(useUIStore.getState().productId).toBe('smart_cafe');
    expect(useUIStore.getState().productScope).toBe('smart_cafe');
    expect(localStorage.getItem('wm_product')).toBe('smart_cafe');
  });

  it('setProductScope aceita visão consolidada all', () => {
    useUIStore.getState().setProductScope('all');
    expect(useUIStore.getState().productId).toBe('all');
    expect(useUIStore.getState().productScope).toBe('all');
    expect(localStorage.getItem('wm_product')).toBe('all');
  });

  it('setProductId de volta para wizmart', () => {
    useUIStore.getState().setProductId('smart_cafe');
    useUIStore.getState().setProductId('wizmart');
    expect(useUIStore.getState().productId).toBe('wizmart');
  });

  it('toggleSidebar alterna sidebarCollapsed', () => {
    const before = useUIStore.getState().sidebarCollapsed;
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(!before);
  });

  it('setSidebarCollapsed define o valor e persiste', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');

    useUIStore.getState().setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });
});
