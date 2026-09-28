/**
 * AuditoriaPane.tsx — Aba "Auditoria de Sessão" nas Configurações
 * (PLANO_DESENHO_CRM.md Fase 6.1, slide 12: "Gerenciador de Login e Logoff").
 *
 * Somente leitura — o histórico é gravado por `logSessionEvent`/
 * `endUserSession` (Cloud Functions), nunca pelo client (ver `firestore.rules`,
 * match `user_sessions`). "Encerrar Sessão" fica no modal "Gerenciar Usuário"
 * da aba Equipe & Usuários, perto de onde o admin já mexe no papel/bloqueio.
 */
import { orderBy, limit } from 'firebase/firestore';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { UserSessionEvent } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';

const EVENT_LABEL: Record<UserSessionEvent['event'], string> = {
  login: 'Login',
  logout: 'Logoff',
  revoked: 'Encerrada (admin)',
};

const EVENT_ICON: Record<UserSessionEvent['event'], { name: string; color: string }> = {
  login: { name: 'LogIn', color: 'var(--primary)' },
  logout: { name: 'LogOut', color: 'var(--text-2)' },
  revoked: { name: 'ShieldAlert', color: '#B91C1C' },
};

function fmtWhen(ts: any): string {
  if (!ts) return '—';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AuditoriaPane() {
  const { data: events, loading } = useFirestoreCollection<UserSessionEvent>(
    'user_sessions',
    [orderBy('at', 'desc'), limit(200)],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="ShieldCheck" size={20} color="var(--primary)" />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Histórico de login, logoff e encerramentos forçados de sessão. Os últimos 200 eventos do tenant.
        </div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Papel</th>
              <th>Evento</th>
              <th>IP</th>
              <th>Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-2)' }}>
                  {loading ? 'Carregando…' : 'Nenhum evento de sessão registrado ainda.'}
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const icon = EVENT_ICON[ev.event] ?? EVENT_ICON.login;
              return (
                <tr key={ev.id}>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtWhen(ev.at)}</td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{ev.userName}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{ev.userRole}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                      <Icon name={icon.name} size={14} color={icon.color} />
                      {EVENT_LABEL[ev.event] ?? ev.event}
                      {ev.event === 'revoked' && ev.endedByName && (
                        <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> por {ev.endedByName}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-2)' }}>{ev.ip ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{ev.userAgent ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
