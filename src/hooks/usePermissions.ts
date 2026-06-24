import { useAuthStore } from '../stores/authStore';
import { useFirestoreCollection } from './useFirestore';

export interface RoleDoc {
  id: string;
  name: string;
  permissions: string[];
}

export function usePermissions() {
  const { user } = useAuthStore();
  // Busca todos os perfis cadastrados no Tenant
  const { data: roles, loading } = useFirestoreCollection<RoleDoc>('roles');

  const userRole = user?.role || 'viewer';

  // Encontra o documento de perfil correspondente
  const activeRoleDoc = roles.find(r => r.id === userRole);

  // Permissões padrão do sistema para fallback (compatibilidade e primeira inicialização)
  const getDefaultPermissions = (role: string): string[] => {
    if (role === 'master') {
      return [
        'view_dashboard',
        'view_pipeline',
        'view_contacts',
        'view_companies',
        'view_cadence',
        'view_activities',
        'view_handoffs',
        'view_tasks',
        'view_leaderboard',
        'view_carteira',
        'view_loja',
        'view_kpi_reports',
        'view_admin_settings',
        'view_management_dashboard',
      ];
    }
    if (role === 'manager') {
      return [
        'view_dashboard',
        'view_pipeline',
        'view_contacts',
        'view_companies',
        'view_activities',
        'view_tasks',
        'view_leaderboard',
        'view_carteira',
        'view_loja',
        'view_kpi_reports',
        'view_management_dashboard',
      ];
    }
    if (role === 'sdr') {
      return [
        'view_dashboard',
        'view_pipeline',
        'view_contacts',
        'view_cadence',
        'view_activities',
        'view_leaderboard',
        'view_carteira',
        'view_loja',
        'view_sdr_dashboard',
      ];
    }
    if (role === 'rep') {
      return [
        'view_dashboard',
        'view_pipeline',
        'view_contacts',
        'view_handoffs',
        'view_leaderboard',
        'view_carteira',
        'view_loja',
        'view_rep_dashboard',
      ];
    }
    if (role === 'bdr') {
      return [
        'view_dashboard',
        'view_pipeline',
        'view_contacts',
        'view_leaderboard',
        'view_carteira',
        'view_loja',
        'view_bdr_dashboard',
      ];
    }
    // viewer / padrão
    return [
      'view_dashboard',
      'view_pipeline',
      'view_contacts',
      'view_companies',
      'view_kpi_reports',
      'view_viewer_dashboard',
    ];
  };

  const permissions = activeRoleDoc ? activeRoleDoc.permissions : getDefaultPermissions(userRole);

  const hasPermission = (perm: string) => {
    // Admin Master sempre tem acesso total a tudo por segurança
    if (userRole === 'master') return true;
    return permissions.includes(perm);
  };

  const getRoleName = (roleId: string): string => {
    const roleDoc = roles.find(r => r.id === roleId);
    if (roleDoc) return roleDoc.name;
    const defaultLabels: Record<string, string> = {
      master: 'Admin Master',
      manager: 'Gestor',
      bdr: 'BDR',
      sdr: 'SDR',
      rep: 'Representante',
      viewer: 'Visualizador',
    };
    return defaultLabels[roleId] || roleId;
  };

  return { permissions, hasPermission, loading, roles, getRoleName };
}

export default usePermissions;
