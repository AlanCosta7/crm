import { useToastStore } from '../../stores/toastStore';
import type { Toast } from '../../stores/toastStore';
import { Icon } from './Icon';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {/* Estilos para animação bounce-in e hover */}
      <style>{`
        @keyframes toastSlideIn {
          0% { transform: translateY(60px) scale(0.85); opacity: 0; }
          70% { transform: translateY(-6px) scale(1.03); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes toastProgress {
          0% { width: 100%; }
          100% { width: 0%; }
        }
        .toast-item {
          animation: toastSlideIn 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          pointer-events: auto;
          transition: all 0.25s ease;
        }
        .toast-item:hover {
          transform: translateY(-3px) scale(1.02) !important;
          box-shadow: 0 12px 30px rgba(0,0,0,0.18) !important;
        }
      `}</style>

      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { type, message, sub, pointsAmount, coinsAmount, achievementIcon, duration } = toast;

  // Temas visuais avançados
  const getTheme = () => {
    switch (type) {
      case 'points':
        return {
          bg: 'rgba(235, 247, 235, 0.95)',
          border: '1.5px solid rgba(26,107,26,0.3)',
          shadow: '0 8px 24px rgba(26,107,26,0.12)',
          icon: 'Zap',
          iconColor: '#8DB600',
          accentColor: '#1A6B1A',
        };
      case 'coins':
        return {
          bg: 'rgba(254, 243, 199, 0.95)',
          border: '1.5px solid rgba(217,119,6,0.3)',
          shadow: '0 8px 24px rgba(217,119,6,0.12)',
          icon: 'Coins',
          iconColor: '#D97706',
          accentColor: '#B45309',
        };
      case 'achievement':
        return {
          bg: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.96) 100%)',
          border: '1.5px solid rgba(139, 92, 246, 0.4)',
          shadow: '0 12px 32px rgba(139, 92, 246, 0.25)',
          icon: achievementIcon || 'Trophy',
          iconColor: '#FFE08A',
          accentColor: '#FFF',
          textColor: '#FFF',
          mutedColor: '#CBD5E1',
        };
      case 'error':
        return {
          bg: 'rgba(254, 242, 242, 0.95)',
          border: '1.5px solid rgba(239,68,68,0.3)',
          shadow: '0 8px 24px rgba(239,68,68,0.12)',
          icon: 'AlertTriangle',
          iconColor: '#EF4444',
          accentColor: '#B91C1C',
        };
      case 'info':
        return {
          bg: 'rgba(240, 249, 255, 0.95)',
          border: '1.5px solid rgba(56,189,248,0.3)',
          shadow: '0 8px 24px rgba(56,189,248,0.12)',
          icon: 'Info',
          iconColor: '#0E7490',
          accentColor: '#0E7490',
        };
      default:
        return {
          bg: 'rgba(255, 255, 255, 0.95)',
          border: '1.5px solid var(--border)',
          shadow: '0 8px 24px rgba(0,0,0,0.08)',
          icon: 'CheckCircle',
          iconColor: 'var(--primary)',
          accentColor: 'var(--primary)',
        };
    }
  };

  const theme = getTheme();
  const isDark = type === 'achievement';

  return (
    <div
      className="toast-item"
      onClick={onDismiss}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: 320,
        background: theme.bg,
        border: theme.border,
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: theme.shadow,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Icone lateral com animação sutil */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ animation: type === 'coins' ? 'spin 3s linear infinite' : 'none' }}>
          <Icon name={theme.icon} size={20} color={theme.iconColor} />
        </div>
      </div>

      {/* Textos */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: theme.textColor || 'var(--text-primary)',
            lineHeight: 1.2,
          }}
        >
          {message}
        </div>
        {(sub || pointsAmount || coinsAmount) && (
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: theme.mutedColor || 'var(--text-secondary)',
              lineHeight: 1.2,
            }}
          >
            {type === 'points' && `+${pointsAmount} PTS para o seu pódio!`}
            {type === 'coins' && `+${coinsAmount} 🪙 adicionadas à sua carteira!`}
            {type === 'achievement' && sub}
            {type !== 'points' && type !== 'coins' && type !== 'achievement' && sub}
          </div>
        )}
      </div>

      {/* Botão de Fechar */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{
          background: 'none',
          border: 'none',
          color: isDark ? '#94A3B8' : '#9aa3af',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Fechar notificação"
      >
        <Icon name="X" size={14} />
      </button>

      {/* Barra de Progresso de Expiração */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          background: theme.iconColor,
          opacity: 0.8,
          animation: `toastProgress ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

export default ToastContainer;
