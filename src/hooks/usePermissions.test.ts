/**
 * usePermissions.test.ts — Testes do hook de controle de acessos (RBAC)
 *
 * Cobre: permissões padrão por perfil, carregamento de papéis customizados
 * do Firestore, super-permissão do perfil 'master' e mapeamento de nomes de perfil.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';
import { useAuthStore } from '../stores/authStore';
import { useFirestoreCollection } from './useFirestore';

// Mock das dependências externas
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('./useFirestore', () => ({
  useFirestoreCollection: vi.fn(),
}));

describe('usePermissions — hook de controle de acesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve carregar com estado de carregamento do Firestore', () => {
    (useAuthStore as any).mockReturnValue({
      user: { role: 'sdr', tenantId: 'tenant-1' },
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: [],
      loading: true,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.loading).toBe(true);
    expect(result.current.permissions).toBeDefined();
  });

  it('deve usar as permissões padrão do sistema se a coleção do Firestore estiver vazia', () => {
    (useAuthStore as any).mockReturnValue({
      user: { role: 'sdr', tenantId: 'tenant-1' },
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: [],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.loading).toBe(false);
    expect(result.current.permissions).toContain('view_cadence');
    expect(result.current.permissions).toContain('view_sdr_dashboard');
    expect(result.current.permissions).not.toContain('view_admin_settings');

    expect(result.current.hasPermission('view_cadence')).toBe(true);
    expect(result.current.hasPermission('view_admin_settings')).toBe(false);
  });

  // Fase 6.1 do PLANO_DESENHO_CRM.md: manager já podia encerrar a sessão de um
  // usuário nas rules/CF (`assertCanEndSession`), mas sem esta permissão a
  // tela de Configurações inteira — onde fica esse botão — ficava invisível
  // pra ele. Achado no QA manual do teste B4.
  it('manager tem view_admin_settings por padrão — precisa da tela pra encerrar sessão de alguém', () => {
    (useAuthStore as any).mockReturnValue({
      user: { role: 'manager', tenantId: 'tenant-1' },
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: [],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toContain('view_admin_settings');
    expect(result.current.hasPermission('view_admin_settings')).toBe(true);
  });

  it('deve mesclar e usar permissões customizadas do Firestore se o perfil correspondente existir', () => {
    const mockRoles = [
      { id: 'sdr', name: 'SDR Customizado', permissions: ['view_dashboard', 'permissao_custom_sdr'] },
      { id: 'rep', name: 'Representante Especial', permissions: ['view_handoffs'] },
    ];
    (useAuthStore as any).mockReturnValue({
      user: { role: 'sdr', tenantId: 'tenant-1' },
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: mockRoles,
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());

    // Não deve usar as permissões padrão do SDR, mas sim as customizadas do Firestore
    expect(result.current.permissions).toEqual(['view_dashboard', 'permissao_custom_sdr']);
    expect(result.current.hasPermission('permissao_custom_sdr')).toBe(true);
    expect(result.current.hasPermission('view_cadence')).toBe(false); // Estava no padrão, mas foi omitida no customizado
  });

  it('usuário com role "master" deve ter sempre permissão total (hasPermission retorna true para qualquer chave)', () => {
    (useAuthStore as any).mockReturnValue({
      user: { role: 'master', tenantId: 'tenant-1' },
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: [{ id: 'master', name: 'Master', permissions: ['view_dashboard'] }], // poucas permissões explícitas
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());

    // Embora o array de permissões venha do banco
    expect(result.current.permissions).toEqual(['view_dashboard']);
    // hasPermission deve ignorar a lista e retornar true para tudo por ser "master"
    expect(result.current.hasPermission('acao_admin_secreta')).toBe(true);
    expect(result.current.hasPermission('view_cadence')).toBe(true);
    expect(result.current.hasPermission('qualquer_coisa')).toBe(true);
  });

  it('deve usar o fallback do perfil "viewer" se o usuário for nulo ou não tiver role', () => {
    (useAuthStore as any).mockReturnValue({
      user: null,
    });
    (useFirestoreCollection as any).mockReturnValue({
      data: [],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toContain('view_viewer_dashboard');
    expect(result.current.permissions).toContain('view_contacts');
    expect(result.current.permissions).not.toContain('view_admin_settings');
    expect(result.current.hasPermission('view_viewer_dashboard')).toBe(true);
  });

  describe('getRoleName', () => {
    it('deve retornar o nome amigável padrão se não houver documentos no Firestore', () => {
      (useAuthStore as any).mockReturnValue({ user: { role: 'manager' } });
      (useFirestoreCollection as any).mockReturnValue({ data: [], loading: false });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.getRoleName('master')).toBe('Admin Master');
      expect(result.current.getRoleName('manager')).toBe('Gestor');
      expect(result.current.getRoleName('sdr')).toBe('SDR');
      expect(result.current.getRoleName('rep')).toBe('Representante');
      expect(result.current.getRoleName('bdr')).toBe('BDR');
      expect(result.current.getRoleName('viewer')).toBe('Visualizador');
      expect(result.current.getRoleName('perfil_desconhecido')).toBe('perfil_desconhecido');
    });

    it('deve retornar o nome customizado do Firestore se o perfil existir', () => {
      const mockRoles = [
        { id: 'manager', name: 'Diretoria de Vendas', permissions: [] },
      ];
      (useAuthStore as any).mockReturnValue({ user: { role: 'manager' } });
      (useFirestoreCollection as any).mockReturnValue({ data: mockRoles, loading: false });

      const { result } = renderHook(() => usePermissions());
      expect(result.current.getRoleName('manager')).toBe('Diretoria de Vendas');
      expect(result.current.getRoleName('sdr')).toBe('SDR'); // Fallback para não cadastrado
    });
  });
});
