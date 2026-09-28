import { useAuthStore } from '../stores/authStore';
import { useFirestoreCollection } from './useFirestore';
import { effectivePermissions } from '../utils/rolePermissions';

export interface RoleDoc {
  id: string;
  name: string;
  permissions: string[];
  permissionsRev?: number;
}

export function usePermissions() {
  const { user } = useAuthStore();
  // Busca todos os perfis cadastrados no Tenant
  const { data: roles, loading } = useFirestoreCollection<RoleDoc>('roles');

  const userRole = user?.role || 'viewer';

  // Encontra o documento de perfil correspondente
  const activeRoleDoc = roles.find(r => r.id === userRole);

  // Padrão do código quando o perfil não tem documento; com documento, o salvo
  // (+ rollouts mais novos que ele) — ver utils/rolePermissions.ts.
  const permissions = effectivePermissions(userRole, activeRoleDoc);

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
      financeiro: 'Financeiro',
    };
    return defaultLabels[roleId] || roleId;
  };

  return { permissions, hasPermission, loading, roles, getRoleName };
}

export default usePermissions;
