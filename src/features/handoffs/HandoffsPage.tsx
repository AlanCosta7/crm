/**
 * HandoffsPage.tsx — Tela de Handoffs do Representante
 *
 * Exibe três seções:
 *  1. Pendentes de aceite → Rep pode Aceitar ou Recusar
 *  2. Aceitos (ativos) → negócios do funil Hunter que o Rep está gerenciando
 *  3. Recusados (histórico)
 *
 * Ao aceitar: chama a Callable acceptHandoff no Firebase Functions
 * → Cloud Function cria a primeira atividade no funil Hunter
 *
 * Ao recusar: pede motivo → notifica gestor (via atividade no feed)
 */

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { Handoff, SettingUser, Deal } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { useAuthStore } from '../../stores/authStore';
import {
  handoffStatusLabel,
  handoffStatusColor,
  canViewAllHandoffs,
} from '../../utils/handoffUtils';
import { PRODUCT_COLOR } from '../../utils/crmFormat';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';
import { dealParticipantConstraint } from '../../utils/dealQueryScope';

// ── Modal de Recusa ───────────────────────────────────────────────────────────
interface DeclineModalProps {
  handoffId: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function DeclineModal({ handoffId: _, onConfirm, onCancel }: DeclineModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try { await onConfirm(reason.trim()); } finally { setSaving(false); }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recusar Handoff</h3>
          <button className="icon-btn" onClick={onCancel}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-bd">
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Motivo da recusa *</div>
              <textarea
                className="input" rows={3} required
                placeholder="Ex: Território fora da minha área, cliente já atendido por outro Rep..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-danger" disabled={saving || !reason.trim()}>
              <Icon name="X" size={15} />{saving ? 'Recusando...' : 'Confirmar Recusa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card de Handoff ───────────────────────────────────────────────────────────
interface HandoffCardProps {
  handoff: Handoff;
  sdrs: SettingUser[];
  deals: Deal[];
  onAccept: (h: Handoff) => void;
  onDecline: (h: Handoff) => void;
  showActions: boolean;
}

function HandoffCard({ handoff, sdrs, deals, onAccept, onDecline, showActions }: HandoffCardProps) {
  const sdr   = sdrs.find(u => u.id === handoff.fromSdrId);
  const deal  = deals.find(d => d.id === handoff.dealId);
  const color = handoffStatusColor(handoff.status);
  const prodColor = deal?.productId ? PRODUCT_COLOR[deal.productId]?.primary : '#1A6B1A';

  const CHANNEL_ICON: Record<string, string> = { email: 'Mail', whatsapp: 'MessageCircle', call: 'Phone' };
  const VISIT_ICON:   Record<string, string> = { presential: 'MapPin', video: 'Video' };

  const formatVisitDate = (ts: any) => {
    if (!ts) return '—';
    const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="card"
      style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden' }}
    >
      {/* Faixa lateral de status */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />

      {/* Faixa lateral de produto */}
      <div style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 3, background: prodColor }} />

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {deal?.name || `Deal #${handoff.dealId.slice(0, 6)}`}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {deal?.company} · {deal?.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart'}
          </div>
        </div>
        <span
          className="badge"
          style={{ background: color + '18', color, border: `1px solid ${color}44`, alignSelf: 'flex-start' }}
        >
          {handoffStatusLabel(handoff.status)}
        </span>
      </div>

      {/* Info do handoff */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="label" style={{ fontSize: 10 }}>Canal prioritário</span>
          <div className="row" style={{ gap: 6 }}>
            <Icon name={CHANNEL_ICON[handoff.priorityChannel] || 'MessageCircle'} size={14} color="var(--primary)" />
            <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{handoff.priorityChannel}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="label" style={{ fontSize: 10 }}>Tipo de visita</span>
          <div className="row" style={{ gap: 6 }}>
            <Icon name={VISIT_ICON[handoff.visitType] || 'MapPin'} size={14} color="var(--primary)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{handoff.visitType === 'presential' ? 'Presencial' : 'Video call'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="label" style={{ fontSize: 10 }}>Data da visita</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{formatVisitDate(handoff.visitScheduledAt)}</span>
        </div>
      </div>

      {/* SDR de origem */}
      {sdr && (
        <div className="row" style={{ gap: 8 }}>
          <Av initials={sdr.initials} color={sdr.color} size={26} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{sdr.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>SDR responsável pelo lead</div>
          </div>
        </div>
      )}

      {/* Notas */}
      {handoff.notes && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>OBSERVAÇÕES DO SDR</div>
          <p style={{ fontSize: 13, margin: 0 }}>{handoff.notes}</p>
        </div>
      )}

      {/* Ações */}
      {showActions && (
        <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onDecline(handoff)}>
            <Icon name="X" size={14} />Recusar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onAccept(handoff)}>
            <Icon name="Check" size={14} />Aceitar handoff
          </button>
        </div>
      )}
    </div>
  );
}

// ── HandoffsPage ──────────────────────────────────────────────────────────────
export function HandoffsPage() {
  const { user }  = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const viewAll   = canViewAllHandoffs(user?.role ?? 'viewer');

  const { data: handoffs, loading } = useFirestoreCollection<Handoff>('handoffs');
  const { data: allUsers }          = useFirestoreCollection<SettingUser>('users');
  const { data: deals }             = useFirestoreCollection<Deal>('deals', dealParticipantConstraint(user));

  const [decliningHandoff, setDecliningHandoff] = useState<Handoff | null>(null);
  const [processingId,     setProcessingId]     = useState<string | null>(null);
  const [tab, setTab]                           = useState<'pending' | 'accepted' | 'declined'>('pending');

  const sdrs = allUsers.filter(u => u.role === 'sdr');
  const dealProductById = new Map(deals.map(d => [d.id, d.productId || 'wizmart']));
  const scopedHandoffs = handoffs.filter(h => matchesProductId(productScope, h.productId || dealProductById.get(h.dealId) || 'wizmart'));

  // Filtra handoffs pelo role
  const myHandoffs = viewAll
    ? scopedHandoffs
    : scopedHandoffs.filter(h => h.toRepId === user?.uid);

  const pending  = myHandoffs.filter(h => h.status === 'pending_rep_acceptance');
  const accepted = myHandoffs.filter(h => h.status === 'accepted');
  const declined = myHandoffs.filter(h => h.status === 'declined');

  const tabs = [
    { key: 'pending'  as const, label: 'Pendentes', count: pending.length,  color: '#F59E0B' },
    { key: 'accepted' as const, label: 'Aceitos',   count: accepted.length, color: '#22C55E' },
    { key: 'declined' as const, label: 'Recusados', count: declined.length, color: '#EF4444' },
  ];

  const currentList = tab === 'pending' ? pending : tab === 'accepted' ? accepted : declined;

  const handleAccept = async (handoff: Handoff) => {
    if (!handoff.id) return;
    setProcessingId(handoff.id);
    try {
      const fn = httpsCallable(functions, 'acceptHandoff');
      await fn({ handoffId: handoff.id, tenantId: user?.tenantId });
    } catch (err) {
      console.error('[HandoffsPage] acceptHandoff failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!decliningHandoff?.id) return;
    setProcessingId(decliningHandoff.id);
    try {
      const fn = httpsCallable(functions, 'declineHandoff');
      await fn({ handoffId: decliningHandoff.id, tenantId: user?.tenantId, reason });
      setDecliningHandoff(null);
    } catch (err) {
      console.error('[HandoffsPage] declineHandoff failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Handoffs</h1>
        {[0, 1, 2].map(i => <div key={i} className="sk" style={{ height: 180, borderRadius: 10 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Handoffs</h1>
          <p className="muted" style={{ marginTop: 2 }}>
            {viewAll ? 'Todos os handoffs do time' : 'Passagens de bastão para você'}
          </p>
        </div>
        {pending.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: '#FEF3C7', border: '1px solid #F59E0B44' }}>
            <Icon name="Bell" size={16} color="#F59E0B" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#B45309' }}>
              {pending.length} handoff{pending.length > 1 ? 's' : ''} aguardando aceite
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8,
              border: `1.5px solid ${tab === t.key ? t.color : 'var(--border)'}`,
              background: tab === t.key ? `${t.color}12` : '#fff',
              cursor: 'pointer', fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? t.color : 'var(--text-2)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ background: tab === t.key ? t.color : 'var(--border)', color: tab === t.key ? '#fff' : 'var(--text-2)', borderRadius: 12, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {currentList.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <Icon name={tab === 'pending' ? 'CheckCircle2' : 'ArrowRightLeft'} size={40} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
            {tab === 'pending' ? 'Nenhum handoff pendente' : `Nenhum handoff ${tab === 'accepted' ? 'aceito' : 'recusado'}`}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {tab === 'pending'
              ? 'Quando um SDR concluir o formulário de passagem de bastão, o handoff aparecerá aqui.'
              : `Handoffs ${tab === 'accepted' ? 'aceitos' : 'recusados'} aparecerão aqui.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {currentList.map(h => (
            <HandoffCard
              key={h.id}
              handoff={h}
              sdrs={sdrs}
              deals={deals}
              onAccept={handleAccept}
              onDecline={setDecliningHandoff}
              showActions={tab === 'pending' && !processingId}
            />
          ))}
        </div>
      )}

      {/* Modal de recusa */}
      {decliningHandoff && (
        <DeclineModal
          handoffId={decliningHandoff.id || ''}
          onConfirm={handleDeclineConfirm}
          onCancel={() => setDecliningHandoff(null)}
        />
      )}
    </div>
  );
}

export default HandoffsPage;
