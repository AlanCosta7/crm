import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import type { UserRole } from '../../types/crm';
import { usePermissions } from '../../hooks/usePermissions';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  permission?: string;
}

export function ProtectedRoute({ children, allowedRoles, permission }: ProtectedRouteProps) {
  const { user, loading } = useAuthStore();
  const { hasPermission, loading: loadingPerms } = usePermissions();
  const location = useLocation();

  if (loading || loadingPerms) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--primary)',
          gap: 16,
        }}
      >
        <div className="sk" style={{ width: 80, height: 80, borderRadius: 20 }} />
        <div style={{ fontWeight: 600, fontSize: 15 }}>Carregando WizMart CRM...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  if (!permission && allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
