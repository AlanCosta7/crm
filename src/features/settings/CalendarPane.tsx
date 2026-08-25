/**
 * CalendarPane.tsx — Painel de integração com Google Calendar nas Configurações
 *
 * Exibe:
 *  - Status da conexão (conectado/desconectado/erro)
 *  - E-mail da conta Google conectada
 *  - Botão "Conectar" → inicia OAuth2 (redireciona para Cloud Function)
 *  - Botão "Desconectar" → chama disconnectCalendar Callable
 *
 * Lê query params da URL para detectar retorno do OAuth:
 *  ?calendar=connected&email=...
 *  ?calendar=denied
 *  ?calendar=error
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../../config/firebase';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { buildOAuthStartUrl, isCalendarConnected, type CalendarTokenData } from '../../utils/calendarUtils';

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL
  || 'https://southamerica-east1-codifyx7.cloudfunctions.net';

export function CalendarPane() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tokenData, setTokenData] = useState<CalendarTokenData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Detecta retorno do OAuth via query params
  useEffect(() => {
    const calendarParam = searchParams.get('calendar');
    const emailParam    = searchParams.get('email');

    if (calendarParam === 'connected' && emailParam) {
      setStatusMessage({ type: 'success', text: `Google Calendar conectado com sucesso! Conta: ${decodeURIComponent(emailParam)}` });
      // Limpa os query params após leitura
      setSearchParams(prev => { prev.delete('calendar'); prev.delete('email'); return prev; });
      loadTokenData(); // Recarrega dados do token
    } else if (calendarParam === 'denied') {
      setStatusMessage({ type: 'info', text: 'Autorização negada. Você pode conectar novamente a qualquer momento.' });
      setSearchParams(prev => { prev.delete('calendar'); return prev; });
    } else if (calendarParam === 'error') {
      setStatusMessage({ type: 'error', text: 'Erro ao conectar. Tente novamente.' });
      setSearchParams(prev => { prev.delete('calendar'); return prev; });
    }
  }, [searchParams]);

  const loadTokenData = async () => {
    if (!user?.tenantId || !user?.uid) return;
    setLoading(true);
    try {
      const tokenRef  = doc(db, 'tenants', user.tenantId, 'calendar_tokens', user.uid);
      const tokenSnap = await getDoc(tokenRef);
      if (tokenSnap.exists()) {
        const data = tokenSnap.data();
        setTokenData({
          userId:        data.userId,
          accessToken:   data.accessToken || '',
          refreshToken:  data.refreshToken || '',
          expiresAt:     data.expiresAt?.toDate?.() || new Date(0),
          calendarId:    data.calendarId || 'primary',
          calendarEmail: data.calendarEmail || '',
          isConnected:   data.isConnected || false,
          connectedAt:   data.connectedAt?.toDate?.() || new Date(),
          lastSyncAt:    data.lastSyncAt?.toDate?.() || undefined,
        } as CalendarTokenData);
      } else {
        setTokenData(null);
      }
    } catch (err) {
      console.error('[CalendarPane] Erro ao carregar token:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTokenData(); }, [user?.uid]);

  const connected = isCalendarConnected(tokenData);

  const handleConnect = () => {
    if (!user?.uid || !user?.tenantId) return;
    const url = buildOAuthStartUrl(FUNCTIONS_URL, `${user.uid}:${user.tenantId}`);
    window.location.href = url;
  };

  const handleDisconnect = async () => {
    if (!user?.tenantId) return;
    setDisconnecting(true);
    try {
      const fn = httpsCallable(functions, 'disconnectCalendar');
      await fn({ tenantId: user.tenantId });
      setTokenData(null);
      setStatusMessage({ type: 'info', text: 'Google Calendar desconectado.' });
    } catch (err) {
      console.error('[CalendarPane] Erro ao desconectar:', err);
      setStatusMessage({ type: 'error', text: 'Erro ao desconectar. Tente novamente.' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="sk" style={{ height: 80, borderRadius: 10 }} />
        <div className="sk" style={{ height: 50, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Mensagem de status (retorno do OAuth) */}
      {statusMessage && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start',
          background: statusMessage.type === 'success' ? '#DCFCE7' : statusMessage.type === 'error' ? '#FEE2E2' : '#DBEAFE',
          border: `1px solid ${statusMessage.type === 'success' ? '#86EFAC' : statusMessage.type === 'error' ? '#FECACA' : '#BFDBFE'}`,
        }}>
          <Icon
            name={statusMessage.type === 'success' ? 'CheckCircle2' : statusMessage.type === 'error' ? 'AlertCircle' : 'Info'}
            size={16}
            color={statusMessage.type === 'success' ? '#16A34A' : statusMessage.type === 'error' ? '#DC2626' : '#2563EB'}
          />
          <p style={{ margin: 0, fontSize: 13, color: statusMessage.type === 'success' ? '#166534' : statusMessage.type === 'error' ? '#991B1B' : '#1E40AF' }}>
            {statusMessage.text}
          </p>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0 }}
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      )}

      {/* Card de status da conexão */}
      <div className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* Ícone Google Calendar */}
        <div style={{
          width: 52, height: 52, borderRadius: 12, flexShrink: 0,
          background: connected ? '#DCFCE7' : '#F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
        }}>
          📅
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Google Calendar</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
              background: connected ? '#DCFCE7' : '#F3F4F6',
              color: connected ? '#166534' : '#6B7280',
            }}>
              {connected ? '● Conectado' : '○ Desconectado'}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {connected
              ? `Conta conectada: ${tokenData?.calendarEmail}`
              : 'Conecte sua conta Google para sincronizar atividades com o Google Calendar automaticamente.'}
          </p>
          {connected && tokenData?.lastSyncAt && (
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Última sincronização: {tokenData.lastSyncAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Ações */}
        {connected ? (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)', flexShrink: 0 }}
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            <Icon name="Unlink" size={14} />
            {disconnecting ? 'Desconectando...' : 'Desconectar'}
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            style={{ flexShrink: 0 }}
            onClick={handleConnect}
          >
            <Icon name="Link" size={14} />
            Conectar
          </button>
        )}
      </div>

      {/* Informações sobre o que é sincronizado */}
      <div className="card card-pad">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>O que é sincronizado automaticamente</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: '📧', label: 'E-mails agendados', desc: 'Lembrete 30 min antes', color: '#1A6B1A' },
            { icon: '📞', label: 'Ligações agendadas', desc: 'Lembrete 10 min antes', color: '#F59E0B' },
            { icon: '🤝', label: 'Reuniões', desc: 'Lembrete 1h antes', color: '#0E7490' },
            { icon: '🗺️', label: 'Visitas presenciais', desc: 'Lembrete 2h antes', color: '#7C3AED' },
            { icon: '📋', label: 'Apresentações de proposta', desc: 'Lembrete 1h antes', color: '#B91C1C' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: item.color }}>{item.label}</span>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>— {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comportamento de sincronização */}
      <div className="card card-pad" style={{ background: 'var(--bg-2)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Comportamento da sincronização</h3>
        <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            'Ao agendar uma atividade no CRM → evento criado automaticamente no Calendar',
            'Ao reagendar (nova data) → evento atualizado (não duplica)',
            'Ao concluir ou cancelar → evento removido do Calendar',
            'Ao re-sincronizar manualmente → atualiza o evento existente',
          ].map((text, i) => (
            <li key={i} className="muted" style={{ fontSize: 13 }}>{text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default CalendarPane;
