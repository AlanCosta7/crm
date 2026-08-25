/**
 * StandbyModal.tsx — Ativação do gatilho Standby em um lead
 *
 * Gera automaticamente a régua obrigatória de follow-ups (mínimo 5, com no
 * máximo 1 semana entre eles) e grava cada follow-up como Activity pendente
 * do usuário atual. O lead fica marcado com `standbyActive` até a régua acabar.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { useFirestoreMutations } from '../../hooks/useFirestore';
import {
  buildStandbySchedule,
  validateStandbySchedule,
  STANDBY_MIN_FOLLOWUPS,
  STANDBY_MAX_GAP_DAYS,
} from '../../utils/standbyUtils';
import { ACTIVITY_TYPE_CONFIG, SDR_ACTIVITY_TYPES, type ActivityType } from '../../utils/cadenceUtils';
import type { Deal } from '../../types/crm';

interface StandbyModalProps {
  deal: Deal;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function StandbyModal({ deal, onClose, onSuccess, onError }: StandbyModalProps) {
  const { user } = useAuthStore();
  const { addDocument: addActivity } = useFirestoreMutations('activities');
  const { updateDocument: updateDeal } = useFirestoreMutations('deals');

  const [channel, setChannel] = useState<ActivityType>('call');
  const [gapDays, setGapDays] = useState(STANDBY_MAX_GAP_DAYS);
  const [count, setCount] = useState(STANDBY_MIN_FOLLOWUPS);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const schedule = useMemo(
    () => buildStandbySchedule(new Date(), count, gapDays),
    [count, gapDays],
  );

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

  const handleConfirm = async () => {
    if (!user?.uid) return;
    const validation = validateStandbySchedule(new Date(), schedule);
    if (!validation.valid) {
      onError(validation.error ?? 'Cronograma inválido.');
      return;
    }
    setSaving(true);
    try {
      // 1. Cria os follow-ups obrigatórios (Activities pendentes do usuário)
      for (const [i, dueAt] of schedule.entries()) {
        await addActivity({
          type: channel,
          dealId: deal.id,
          userId: user.uid,
          cadenceType: 'standby',
          standbyIndex: i + 1,
          standbyTotal: schedule.length,
          status: 'pending',
          scheduledAt: dueAt,
          dueAt,
          coinsAwarded: 0,
          wasOnTime: false,
          overdueNotificationCount: 0,
          contactName: deal.name,
          companyName: deal.company,
          productId: deal.productId || 'wizmart',
          text: note.trim() ? `Standby ${i + 1}/${schedule.length} — ${note.trim()}` : `Standby ${i + 1}/${schedule.length}`,
        });
      }
      // 2. Marca o lead como em Standby
      await updateDeal(deal.id, {
        standbyActive: true,
        standbyStartedAt: new Date(),
        standbyFollowUps: schedule.length,
        updatedAt: new Date(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('[StandbyModal] Erro ao ativar standby:', err);
      onError('Não foi possível ativar o Standby. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 320 }}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="PauseCircle" size={18} color="#B45309" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Ativar Standby</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{deal.name}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            O Standby registra automaticamente a régua obrigatória de follow-ups:
            no mínimo {STANDBY_MIN_FOLLOWUPS}, com no máximo {STANDBY_MAX_GAP_DAYS} dias entre um e outro.
          </p>

          {/* Canal */}
          <div>
            <div className="fl" style={{ marginBottom: 8 }}>Canal dos follow-ups</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {SDR_ACTIVITY_TYPES.map(t => {
                const cfg = ACTIVITY_TYPE_CONFIG[t];
                const on = channel === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChannel(t)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px',
                      borderRadius: 8, border: `1.5px solid ${on ? cfg.color : 'var(--border)'}`,
                      background: on ? cfg.bg : '#fff', cursor: 'pointer',
                      fontWeight: on ? 700 : 400, fontSize: 11.5, color: on ? cfg.color : 'var(--text-primary)',
                    }}
                  >
                    <Icon name={cfg.icon} size={15} color={on ? cfg.color : 'var(--text-2)'} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantidade e intervalo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Follow-ups (mín. {STANDBY_MIN_FOLLOWUPS})</div>
              <input className="input" type="number" min={STANDBY_MIN_FOLLOWUPS} max={12}
                value={count} onChange={e => setCount(Number(e.target.value))} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Intervalo em dias (máx. {STANDBY_MAX_GAP_DAYS})</div>
              <input className="input" type="number" min={1} max={STANDBY_MAX_GAP_DAYS}
                value={gapDays} onChange={e => setGapDays(Number(e.target.value))} />
            </div>
          </div>

          {/* Preview da régua */}
          <div className="card" style={{ padding: '10px 14px' }}>
            <div className="label" style={{ fontSize: 10.5, marginBottom: 8 }}>Cronograma gerado</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {schedule.map((d, i) => (
                <span key={i} className="badge badge-gray" style={{ fontSize: 11 }}>
                  {i + 1}º · {fmtDate(d)}
                </span>
              ))}
            </div>
          </div>

          {/* Nota */}
          <div className="field" style={{ margin: 0 }}>
            <div className="fl">Motivo / contexto (opcional)</div>
            <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Ex.: cliente pediu retorno depois do inventário..." style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            <Icon name="PauseCircle" size={15} />
            {saving ? 'Ativando...' : `Ativar Standby (${schedule.length} follow-ups)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StandbyModal;
