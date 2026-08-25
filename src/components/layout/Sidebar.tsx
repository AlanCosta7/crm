import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { Logo } from '../ui/Logo';
import { Av } from '../ui/Av';
import { Icon } from '../ui/Icon';
import type { UserRole } from '../../types/crm';
import { usePermissions } from '../../hooks/usePermissions';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  cnt?: number;
}

interface NavSection {
  section: string;
  roles: UserRole[]; // quais roles enxergam esta seção
  items: NavItem[];
}

// Mapa de quais roles enxergam cada seção/item
const NAV: NavSection[] = [
  {
    section: 'Principal',
    roles: ['master', 'manager', 'bdr', 'sdr', 'rep', 'viewer'],
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/' },
    ],
  },
  {
    section: 'Pipeline',
    // sdr precisa estar aqui: tem a permissão view_pipeline (usePermissions.ts) e a
    // rota /pipeline é liberada por permissão, não por role — sem 'sdr' aqui o item
    // fica com a permissão mas sem o menu pra chegar nele.
    roles: ['master', 'manager', 'bdr', 'sdr', 'viewer'],
    items: [
      { id: 'pipeline', label: 'Pipeline', icon: 'Workflow', path: '/pipeline' },
      { id: 'contacts', label: 'Contatos', icon: 'Users', path: '/contacts' },
      { id: 'companies', label: 'Empresas', icon: 'Building2', path: '/companies' },
    ],
  },
  {
    section: 'Cadência',
    roles: ['master', 'manager', 'sdr'],
    items: [
      { id: 'cadencia', label: 'Cadência Diária', icon: 'ListChecks', path: '/cadencia' },
      { id: 'contacts-sdr', label: 'Contatos', icon: 'Users', path: '/contacts' },
      { id: 'activities', label: 'Atividades', icon: 'Activity', path: '/activities' },
    ],
  },
  {
    section: 'Representante',
    roles: ['master', 'manager', 'rep'],
    items: [
      { id: 'handoffs', label: 'Handoffs', icon: 'ArrowRightLeft', path: '/handoffs' },
      { id: 'pipeline-rep', label: 'Pipeline', icon: 'Workflow', path: '/pipeline' },
      { id: 'contacts-rep', label: 'Contatos', icon: 'Users', path: '/contacts' },
    ],
  },
  {
    section: 'Atividades',
    roles: ['master', 'manager'],
    items: [
      { id: 'tasks', label: 'Tarefas', icon: 'CheckSquare', path: '/tasks' },
      { id: 'activities-mgr', label: 'Atividades', icon: 'Activity', path: '/activities' },
      { id: 'comissoes', label: 'Comissões', icon: 'Calculator', path: '/comissoes' },
      { id: 'comissoes-rel', label: 'Relatório Comissões', icon: 'FileBarChart', path: '/comissoes/relatorio' },
    ],
  },
  {
    section: 'Gamificação',
    roles: ['master', 'manager', 'bdr', 'sdr', 'rep'],
    items: [
      { id: 'leaderboard', label: 'Leaderboard', icon: 'Trophy', path: '/leaderboard' },
      { id: 'carteira', label: 'Carteira', icon: 'Coins', path: '/carteira' },
      { id: 'loja', label: 'Loja de Prêmios', icon: 'ShoppingBag', path: '/loja' },
    ],
  },
  {
    section: 'Projetos',
    roles: ['master', 'manager', 'bdr', 'sdr', 'rep'],
    items: [
      { id: 'projetos', label: 'Projetos de Layout', icon: 'PenLine', path: '/projetos' },
    ],
  },
  {
    section: 'Design',
    roles: ['design' as UserRole],
    items: [
      { id: 'design-queue', label: 'Fila de Projetos', icon: 'Layers', path: '/design-queue' },
    ],
  },
  {
    section: 'Análise',
    roles: ['master', 'manager', 'viewer'],
    items: [
      { id: 'kpis', label: 'KPIs', icon: 'BarChart3', path: '/kpi' },
    ],
  },
  {
    section: 'Admin',
    roles: ['master', 'manager'],
    items: [
      { id: 'settings', label: 'Configurações', icon: 'Settings', path: '/settings' },
      { id: 'metas',    label: 'Metas',          icon: 'Target',  path: '/settings/metas' },
      { id: 'cadencia-config', label: 'Cadência', icon: 'CalendarClock', path: '/settings/cadencia' },
    ],
  },
];

// Cores de badge por role
const getRoleBadgeStyle = (roleId: string) => {
  const r = roleId.toLowerCase();
  if (r === 'master') return { bg: '#1A6B1A', color: '#fff' };
  if (r.includes('manager') || r.includes('gestor')) return { bg: '#0E7490', color: '#fff' };
  if (r.includes('sdr')) return { bg: '#B45309', color: '#fff' };
  if (r.includes('rep') || r.includes('representante')) return { bg: '#B91C1C', color: '#fff' };
  if (r.includes('bdr')) return { bg: '#7C3AED', color: '#fff' };
  return { bg: '#4B5563', color: '#fff' };
};

const NAV_PERMISSIONS: Record<string, string> = {
  dashboard: 'view_dashboard',
  pipeline: 'view_pipeline',
  'pipeline-rep': 'view_pipeline',
  contacts: 'view_contacts',
  'contacts-sdr': 'view_contacts',
  'contacts-rep': 'view_contacts',
  companies: 'view_companies',
  cadencia: 'view_cadence',
  activities: 'view_activities',
  'activities-mgr': 'view_activities',
  handoffs: 'view_handoffs',
  tasks: 'view_tasks',
  leaderboard: 'view_leaderboard',
  carteira: 'view_carteira',
  loja: 'view_loja',
  kpis: 'view_kpi_reports',
  settings: 'view_admin_settings',
  projetos: '',
  'design-queue': '',
  metas: '',
};

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, getRoleName } = usePermissions();

  const handleLogout = () => {
    useAuthStore.getState().setUser(null);
    import('../../config/firebase').then(({ auth }) => auth.signOut());
  };

  const isItemActive = (path: string, id: string) => {
    if (id === 'dashboard') return location.pathname === '/';
    const basePath = path.split('?')[0];
    return location.pathname === basePath || location.pathname.startsWith(basePath + '/');
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (window.innerWidth <= 768) {
      setSidebarCollapsed(true);
    }
  };

  // Filtra e deduplica itens por path para evitar duplicações entre seções de roles diferentes
  const seenPaths = new Set<string>();

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* Logo + toggle */}
      <div className="sb-logo" style={{ position: 'relative' }}>
        <Logo size={32} />
        <button
          onClick={toggleSidebar}
          style={{
            position: 'absolute',
            right: sidebarCollapsed ? 16 : 14,
            top: 14,
            width: 26,
            height: 26,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            zIndex: 10,
          }}
          title={sidebarCollapsed ? 'Expandir Menu' : 'Colapsar Menu'}
        >
          <Icon name={sidebarCollapsed ? 'ChevronRight' : 'ChevronLeft'} size={14} />
        </button>
      </div>

      {/* Navegação por role */}
      <nav className="sb-nav">
        {NAV.filter((sec) => !!user && sec.roles.includes(user.role)).map((sec) => {
          // Filtra itens já vistos em seções anteriores e por permissão
          const visibleItems = sec.items.filter((it) => {
            const perm = NAV_PERMISSIONS[it.id];
            if (perm && !hasPermission(perm)) return false;

            const key = it.path.split('?')[0];
            if (seenPaths.has(key)) return false;
            seenPaths.add(key);
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={sec.section} style={{ marginBottom: 14 }}>
              <div className="sb-section">{sec.section}</div>
              {visibleItems.map((it) => {
                const active = isItemActive(it.path, it.id);
                return (
                  <button
                    key={it.id}
                    className={`sb-item ${active ? 'active' : ''}`}
                    onClick={() => handleNavigate(it.path)}
                    title={sidebarCollapsed ? it.label : undefined}
                  >
                    <Icon name={it.icon} size={18} />
                    <span>{it.label}</span>
                    {it.cnt != null && <span className="cnt">{it.cnt}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Rodapé com perfil */}
      <div className="sb-user">
        {user ? (
          <>
            <Av name={user.name} initials={user.initials} color={user.color} size={36} />
            <div className="info" style={{ flex: 1, minWidth: 0 }}>
              <div className="nm" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div className="lv">
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: getRoleBadgeStyle(user.role).bg,
                    color: getRoleBadgeStyle(user.role).color,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {getRoleName(user.role)}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="icon-btn"
              style={{ width: 28, height: 28, color: 'var(--danger)', flexShrink: 0 }}
              title="Sair do Sistema"
            >
              <Icon name="LogOut" size={15} />
            </button>
          </>
        ) : (
          <div className="sk" style={{ height: 36, width: '100%', borderRadius: 8 }} />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
