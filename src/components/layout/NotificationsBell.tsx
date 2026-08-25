/**
 * NotificationsBell.tsx — Sino de notificações in-app do Topbar.
 *
 * Lê tenants/{tid}/notifications do usuário logado (as rules só permitem ler
 * as próprias, por isso o filtro userId é obrigatório). Criadas por Cloud
 * Functions (ex.: onLeadCreated ao captar lead pelo WizMart Forms).
 * Clicar numa notificação marca como lida e navega para o pipeline.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { where, orderBy, limit } from 'firebase/firestore';
import { useAuthStore } from '../../stores/authStore';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { AppNotification } from '../../types/crm';
import { Icon } from '../ui/Icon';

function fmtWhen(ts: any): string {
  if (!ts) return '';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function NotificationsBell() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const constraints = useMemo(
    () => (user?.uid ? [where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)] : []),
    [user?.uid]
  );
  const { data: notifications } = useFirestoreCollection<AppNotification>('notifications', constraints);
  const { updateDocument } = useFirestoreMutations('notifications');

  const unread = notifications.filter(n => !n.read);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const markRead = (n: AppNotification) => {
    if (!n.read) updateDocument(n.id, { read: true }).catch(() => {});
  };

  const handleClick = (n: AppNotification) => {
    markRead(n);
    setOpen(false);
    if (n.dealId) navigate('/pipeline');
  };

  const markAllRead = () => {
    unread.forEach(n => updateDocument(n.id, { read: true }).catch(() => {}));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title="Notificações"
        aria-label={unread.length > 0 ? `Notificações (${unread.length} não lidas)` : 'Notificações'}
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative' }}
      >
        <Icon name="Bell" size={19} />
        {unread.length > 0 && (
          <span
            data-testid="bell-badge"
            style={{
              position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
              borderRadius: 100, background: '#DC2626', color: '#fff',
              fontSize: 10, fontWeight: 800, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340,
            background: 'var(--surface, #fff)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.14)', zIndex: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>Notificações</span>
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-2)' }}>
                Nenhuma notificação por aqui.
              </div>
            )}
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex', gap: 10, width: '100%', textAlign: 'left',
                  padding: '11px 14px', border: 'none', cursor: 'pointer',
                  background: n.read ? 'transparent' : 'var(--primary-light, #F0F7F0)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ marginTop: 2 }}>
                  <Icon
                    name={n.type === 'lead_received' ? 'Inbox' : 'Info'}
                    size={16}
                    color={n.read ? '#9aa3af' : 'var(--primary)'}
                  />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: n.read ? 600 : 800 }}>{n.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtWhen(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
