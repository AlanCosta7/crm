/**
 * LostReasonModal.tsx — Motivo estruturado ao marcar um negócio como "Perdeu"
 *
 * Pedido do cliente (Observações CRM, jul/2026): lista fechada de motivos.
 * "Fechou com concorrente" e "Não tem interesse no momento" avisam que o
 * lead será devolvido ao BDR para uma nova tentativa de prospecção futura.
 */
import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { LOST_REASONS, requeuesToBdr } from '../../utils/lostReasonUtils';
import type { Deal, LostReasonId } from '../../types/crm';

interface LostReasonModalProps {
  deal: Deal;
  onClose: () => void;
  onConfirm: (reasonId: LostReasonId, note: string) => Promise<void>;
}

export function LostReasonModal({ deal, onClose, onConfirm }: LostReasonModalProps) {
  const [reasonId, setReasonId] = useState<LostReasonId | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const willRequeue = reasonId ? requeuesToBdr(reasonId) : false;

  const handleConfirm = async () => {
    if (!reasonId) {
      setError('Selecione um motivo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(reasonId, note.trim());
    } catch (err: any) {
      console.error('[LostReasonModal] Erro ao marcar perda:', err);
      setError('Não foi possível registrar a perda. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 320 }}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="X" size={18} color="#B91C1C" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Marcar como Perdido</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{deal.name}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cancelar">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="fl" style={{ marginBottom: 8 }}>Motivo da perda *</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {LOST_REASONS.map(r => {
                const on = reasonId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setReasonId(r.id); setError(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px', textAlign: 'left',
                      borderRadius: 8, border: `1.5px solid ${on ? '#B91C1C' : 'var(--border)'}`,
                      background: on ? '#FEE2E2' : '#fff', cursor: 'pointer',
                      fontWeight: on ? 700 : 400, fontSize: 12.5, color: on ? '#B91C1C' : 'var(--text-primary)',
                    }}
                  >
                    {on && <Icon name="Check" size={13} color="#B91C1C" style={{ flexShrink: 0 }} />}
                    {r.label}
                  </button>
                );
              })}
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</p>}
          </div>

          {willRequeue && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Icon name="RotateCcw" size={15} color="#92400E" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
                Este motivo devolve o lead diretamente ao BDR para uma nova tentativa de prospecção no futuro.
              </p>
            </div>
          )}

          <div className="field" style={{ margin: 0 }}>
            <div className="fl">Observações (opcional)</div>
            <textarea
              className="input"
              rows={2}
              placeholder="Contexto adicional sobre a perda..."
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={saving}>
            <Icon name="X" size={15} />
            {saving ? 'Salvando...' : 'Confirmar Perda'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LostReasonModal;
