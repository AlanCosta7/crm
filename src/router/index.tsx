import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import LoginPage from '../features/auth/LoginPage';
import SsoPage from '../features/auth/SsoPage';
import Shell from '../components/layout/Shell';
import PostLoginLanding from '../features/auth/PostLoginLanding';
import RouteErrorPage from './RouteErrorPage';

function LazyLoader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="sk" style={{ height: 40, width: '40%', borderRadius: 6 }} />
      <div className="sk" style={{ height: 160, width: '100%', borderRadius: 8, marginTop: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 10 }}>
        <div className="sk" style={{ height: 280, borderRadius: 8 }} />
        <div className="sk" style={{ height: 280, borderRadius: 8 }} />
      </div>
    </div>
  );
}

// ── Páginas existentes ────────────────────────────────────────────────────────
const DashboardPage   = lazy(() => import('../features/dashboard/DashboardPage'));
const PipelinePage    = lazy(() => import('../features/pipeline/PipelinePage'));
const ContactsPage    = lazy(() => import('../features/contacts/ContactsPage'));
const CompaniesPage   = lazy(() => import('../features/companies/CompaniesPage'));
const TasksPage       = lazy(() => import('../features/tasks/TasksPage'));
const ActivitiesPage  = lazy(() => import('../features/activities/ActivitiesPage'));
const LeaderboardPage = lazy(() => import('../features/gamification/LeaderboardPage'));
const KPIsPage        = lazy(() => import('../features/kpis/KPIsPage'));
const SettingsPage    = lazy(() => import('../features/settings/SettingsPage'));
const TVPage          = lazy(() => import('../features/tv/TVPage'));

// Fase 4 — Cadência SDR
const CadenciaPage = lazy(() => import('../features/cadencia/CadenciaPage'));

// Fase 5 — Handoffs Rep
const HandoffsPage = lazy(() => import('../features/handoffs/HandoffsPage'));
// Ajustes jul/2026 — Página inteira do lead
const LeadPage = lazy(() => import('../features/deals/LeadPage'));
// Fase 7 — Moedas e Loja
const CarteiraPage = lazy(() => import('../features/carteira/CarteiraPage'));
const LojaPage     = lazy(() => import('../features/loja/LojaPage'));

// Sprint 4 — Módulo de Projetos
const ProjectsPage    = lazy(() => import('../features/projetos/ProjectsPage'));
const DesignQueuePage = lazy(() => import('../features/projetos/DesignQueuePage'));

// Sprint 5 — Metas
const MetasPage = lazy(() => import('../features/settings/MetasPage'));
// Ajustes jul/2026 — Programação manual da cadência
const CadenceConfigPage = lazy(() => import('../features/settings/CadenceConfigPage'));
// Achado crítico (PLANO_DESENHO_CRM.md, 13/09/2026) — CRUD de templates de mensagem
const TemplatesConfigPage = lazy(() => import('../features/settings/TemplatesConfigPage'));

// Comissões — Calculadora de comissão (gerente comercial)
const ComissoesPage = lazy(() => import('../features/comissoes/ComissoesPage'));
const RelatorioComissoesPage = lazy(() => import('../features/comissoes/RelatorioComissoesPage'));
// Fase 5.1 — tela do próprio vendedor (BDR/SDR/Rep), "sem um ter a visão do outro"
const MinhaComissaoPage = lazy(() => import('../features/comissoes/MinhaComissaoPage'));
// Fase 5.4 — fila do papel `financeiro`: valida contrato de Comodato Smart Café
const FinanceiroContratosPage = lazy(() => import('../features/deals/FinanceiroContratosPage'));

// ── Helper ───────────────────────────────────────────────────────────────────
type Role = 'master' | 'manager' | 'bdr' | 'sdr' | 'rep' | 'viewer';

function P({ children, roles, permission, noScroll }: { children: React.ReactNode; roles?: Role[]; permission?: string; noScroll?: boolean }) {
  return (
    <ProtectedRoute allowedRoles={roles} permission={permission}>
      <Shell scroll={!noScroll}>
        <Suspense fallback={<LazyLoader />}>{children}</Suspense>
      </Shell>
    </ProtectedRoute>
  );
}

export const router = createBrowserRouter([
  // Rota-raiz sem path: só existe para dar um errorElement a todas as rotas
  // (substitui a tela padrão "Olá, desenvolvedor" do React Router).
  {
    errorElement: <RouteErrorPage />,
    children: [
      // ── Rotas abertas a todos os roles (ou validadas por permissão) ────────────────
      // O SDR cai na fila do dia ao entrar (slide 9); Dashboard segue acessível
      // pela sidebar — ver PostLoginLanding.
      { path: '/',            element: <P permission="view_dashboard"><PostLoginLanding><DashboardPage /></PostLoginLanding></P> },
      { path: '/contacts',    element: <P permission="view_contacts"><ContactsPage /></P> },
      { path: '/companies',   element: <P permission="view_companies"><CompaniesPage /></P> },
      { path: '/activities',  element: <P permission="view_activities"><ActivitiesPage /></P> },
      { path: '/leaderboard', element: <P permission="view_leaderboard"><LeaderboardPage /></P> },
      { path: '/gamification',element: <P permission="view_leaderboard"><LeaderboardPage /></P> },

      // ── Pipeline — bdr, master, manager (e viewer somente leitura) ───────────
      {
        path: '/pipeline',
        element: (
          <ProtectedRoute permission="view_pipeline">
            <Shell scroll={false}>
              <Suspense fallback={<LazyLoader />}><PipelinePage /></Suspense>
            </Shell>
          </ProtectedRoute>
        ),
      },

      // ── Página inteira do lead — todos os papéis que leem deals ───────────────
      { path: '/lead/:dealId', element: <P roles={['master', 'manager', 'bdr', 'sdr', 'rep', 'viewer', 'design'] as any}><LeadPage /></P> },

      // ── Tarefas legadas ────────────────────────────────────────────────────────
      { path: '/tasks',      element: <P permission="view_tasks"><TasksPage /></P> },

      // ── v2: Cadência SDR ──────────────────────────────────────────────────────
      { path: '/cadencia',   element: <P permission="view_cadence"><CadenciaPage /></P> },

      // ── v2: Handoffs Rep ──────────────────────────────────────────────────────
      { path: '/handoffs',   element: <P permission="view_handoffs"><HandoffsPage /></P> },

      // ── v2: Gamificação — Carteira e Loja ─────────────────────────────────────
      { path: '/carteira',   element: <P permission="view_carteira"><CarteiraPage /></P> },
      { path: '/loja',       element: <P permission="view_loja"><LojaPage /></P> },

      // ── KPIs — manager e master ───────────────────────────────────────────────
      { path: '/kpi',        element: <P permission="view_kpi_reports"><KPIsPage /></P> },

      // ── Sprint 4: Projetos de Layout ──────────────────────────────────────────
      { path: '/projetos',      element: <P roles={['master', 'manager', 'bdr', 'sdr', 'rep'] as Role[]}><ProjectsPage /></P> },
      { path: '/design-queue',  element: <P roles={['master', 'manager', 'design'] as any}><DesignQueuePage /></P> },

      // ── Sprint 5: Metas ───────────────────────────────────────────────────────
      { path: '/settings/metas', element: <P roles={['master', 'manager'] as Role[]}><MetasPage /></P> },
      { path: '/settings/cadencia', element: <P roles={['master', 'manager'] as Role[]}><CadenceConfigPage /></P> },
      { path: '/settings/templates', element: <P roles={['master', 'manager'] as Role[]}><TemplatesConfigPage /></P> },
      { path: '/comissoes',           element: <P roles={['master', 'manager'] as Role[]}><ComissoesPage /></P> },
      { path: '/comissoes/relatorio', element: <P roles={['master', 'manager'] as Role[]}><RelatorioComissoesPage /></P> },
      // Fase 5.1 — cada um vê só a própria fatia; nunca o total do card nem os colegas
      { path: '/minha-comissao', element: <P roles={['bdr', 'sdr', 'rep'] as Role[]}><MinhaComissaoPage /></P> },
      // Fase 5.4 — 'financeiro' não está no type Role (perfil dinâmico, como 'design')
      { path: '/financeiro/contratos', element: <P roles={['master', 'manager', 'financeiro'] as any}><FinanceiroContratosPage /></P> },

      // ── Admin — somente master ────────────────────────────────────────────────
      { path: '/settings',   element: <P permission="view_admin_settings"><SettingsPage /></P> },

      // ── TV Display — pública ──────────────────────────────────────────────────
      {
        path: '/tv/:token',
        element: (
          <Suspense fallback={<div style={{ background: '#0A1F0A', height: '100vh', width: '100vw' }} />}>
            <TVPage />
          </Suspense>
        ),
      },

      // ── Auth ──────────────────────────────────────────────────────────────────
      { path: '/login', element: <LoginPage /> },
      // Handoff de SSO vindo do wizmart-rep-app — pública, sem menu (PLANO_PWA_REPRESENTANTES.md §3.3)
      { path: '/sso', element: <SsoPage /> },

      // ── Fallback ──────────────────────────────────────────────────────────────
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default router;
