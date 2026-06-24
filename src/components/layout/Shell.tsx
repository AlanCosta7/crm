import { useEffect, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastContainer } from '../ui/ToastContainer';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { pwaNotifications } from '../../utils/pwaNotifications';

interface ShellProps {
  crumbs?: string[];
  children: ReactNode;
  scroll?: boolean;
}

export function Shell({ crumbs, children, scroll = true }: ShellProps) {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  useEffect(() => {
    if (!user?.uid || !user?.tenantId) return;

    // Executa no login/montagem
    const initNotifications = async () => {
      const permission = await pwaNotifications.requestPermission();
      if (permission === 'granted') {
        // Envia notificação após 3 segundos para dar tempo do app carregar visualmente
        setTimeout(() => {
          pwaNotifications.notifyDailyTasks(user.tenantId, user.uid);
        }, 3000);
      }
    };

    initNotifications();
  }, [user?.uid, user?.tenantId]);

  return (
    <div className="app">
      {/* Sidebar esquerdo fixo retrátil */}
      <Sidebar />

      {/* Backdrop para fechar o sidebar no mobile ao clicar fora */}
      {!sidebarCollapsed && (
        <div
          className="sidebar-backdrop"
          onClick={toggleSidebar}
          style={{ display: 'none' }}
        />
      )}
      
      <div className="main">
        {/* Topbar com breadcrumbs dinâmicos e área de notificações */}
        <Topbar crumbs={crumbs} />
        
        {/* Renderiza a página principal com scroll habilitado ou layout flexível */}
        {scroll ? (
          <div className="content">
            {children}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
        )}
      </div>

      {/* Container global de toasts de gamificação */}
      <ToastContainer />
    </div>
  );
}

export default Shell;
