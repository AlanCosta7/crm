/**
 * HandoffModal.tsx — Formulário obrigatório de passagem de bastão SDR → Rep
 *
 * Exibido quando o deal é movido para um estágio com `isHandoffRequired === true`.
 * O formulário coleta: canal prioritário, tipo de visita, data/hora, rep designado e notas.
 * A validação usa validateHandoffForm de funnelUtils.ts.
 */

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { validateHandoffForm, type HandoffFormData } from '../../utils/funnelUtils';
import type { Deal, SettingUser } from '../../types/crm';

interface HandoffModalProps {
  deal: Deal;
  reps: SettingUser[];          // lista de usuários com role === 'rep'
  onConfirm: (data: HandoffFormData) => Promise<void>;
  onCancel: () => void;
}

const CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp',  icon: 'MessageCircle', color: '#25D366' },
  { value: 'email',    label: 'E-mail',    icon: 'Mail',           color: '#1A6B1A' },
  { value: 'call',     label: 'Ligação',   icon: 'Phone',          color: '#F59E0B' },
] as const;

const VISIT_OPTIONS = [
  { value: 'presential', label: 'Presencial',  icon: 'MapPin' },
  { value: 'video',      label: 'Video call',  icon: 'Video'  },
] as const;

export function HandoffModal({ deal, reps, onConfirm, onCancel }: HandoffModalProps) {
  const [channel,    setChannel]   = useState<HandoffFormData['priorityChannel'] | ''>('');
  const [visitType,  setVisitType] = useState<HandoffFormData['visitType'] | ''>('');
  const [visitAt,    setVisitAt]   = useState('');
  const [repId,      setRepId]     = useState('');
  const [notes,      setNotes]     = useState('');
  const [saving,     setSaving]    = useState(false);
  const [errors,     setErrors]    = useState<Partial<Record<keyof HandoffFormData, string>>>({});

  // Data mínima para o datepicker = amanhã
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 16);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form: Partial<HandoffFormData> = {
      priorityChannel: channel as HandoffFormData['priorityChannel'],
      visitType: visitType as HandoffFormData['visitType'],
      visitScheduledAt: visitAt,
      toRepId: repId,
      notes,
    };
    const validation = validateHandoffForm(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setSaving(true);
    try {
      await onConfirm(form as HandoffFormData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="ArrowRightLeft" size={18} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Passagem de Bastão</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{deal.name}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancelar">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Canal prioritário */}
            <div>
              <div className="fl" style={{ marginBottom: 8 }}>Canal prioritário de follow-up *</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CHANNEL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setChannel(opt.value); setErrors(p => ({ ...p, priorityChannel: undefined })); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                      borderRadius: 8, border: `1.5px solid ${channel === opt.value ? opt.color : 'var(--border)'}`,
                      background: channel === opt.value ? `${opt.color}12` : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s', fontWeight: channel === opt.value ? 700 : 400,
                      color: channel === opt.value ? opt.color : 'var(--text-primary)',
                    }}
                  >
                    <Icon name={opt.icon} size={15} color={channel === opt.value ? opt.color : 'var(--text-2)'} />
                    {opt.label}
                  </button>
                ))}
              </div>
              {errors.priorityChannel && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.priorityChannel}</p>}
            </div>

            {/* Tipo de visita */}
            <div>
              <div className="fl" style={{ marginBottom: 8 }}>Tipo de visita *</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {VISIT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setVisitType(opt.value); setErrors(p => ({ ...p, visitType: undefined })); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      borderRadius: 8, border: `1.5px solid ${visitType === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                      background: visitType === opt.value ? 'var(--primary-light)' : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s',
                      color: visitType === opt.value ? 'var(--primary)' : 'var(--text-primary)',
                      fontWeight: visitType === opt.value ? 700 : 400,
                    }}
                  >
                    <Icon name={opt.icon} size={15} color={visitType === opt.value ? 'var(--primary)' : 'var(--text-2)'} />
                    {opt.label}
                  </button>
                ))}
              </div>
              {errors.visitType && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.visitType}</p>}
            </div>

            {/* Data e hora */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Data e hora da visita *</div>
              <input
                className={`input ${errors.visitScheduledAt ? 'border-red-500' : ''}`}
                type="datetime-local"
                min={minDate}
                value={visitAt}
                onChange={e => { setVisitAt(e.target.value); setErrors(p => ({ ...p, visitScheduledAt: undefined })); }}
              />
              {errors.visitScheduledAt && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.visitScheduledAt}</p>}
            </div>

            {/* Representante */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Representante designado *</div>
              {reps.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>Nenhum representante cadastrado. Adicione em Configurações → Usuários.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reps.map(rep => (
                    <label
                      key={rep.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        borderRadius: 8, border: `1.5px solid ${repId === rep.id ? 'var(--primary)' : 'var(--border)'}`,
                        background: repId === rep.id ? 'var(--primary-light)' : '#fff',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <input type="radio" name="repId" value={rep.id || ''} checked={repId === rep.id} onChange={() => { setRepId(rep.id || ''); setErrors(p => ({ ...p, toRepId: undefined })); }} style={{ display: 'none' }} />
                      <Av initials={rep.initials} color={rep.color} size={32} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: repId === rep.id ? 'var(--primary)' : 'var(--text-primary)' }}>{rep.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{rep.email}</div>
                      </div>
                      {repId === rep.id && <Icon name="Check" size={16} color="var(--primary)" style={{ marginLeft: 'auto' }} />}
                    </label>
                  ))}
                </div>
              )}
              {errors.toRepId && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.toRepId}</p>}
            </div>

            {/* Notas */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Observações para o representante</div>
              <textarea
                className="input"
                rows={3}
                placeholder="Contexto do cliente, objeções, histórico relevante..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="ArrowRightLeft" size={16} />
              {saving ? 'Salvando...' : 'Confirmar Handoff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default HandoffModal;
