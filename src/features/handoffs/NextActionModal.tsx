/**
 * NextActionModal.tsx — Modal obrigatório "Qual a próxima ação?" do Representante
 *
 * Exibido após o Rep concluir qualquer atividade.
 * O modal NÃO pode ser fechado sem preencher os campos (botão X desabilitado).
 * Se o Rep ignorar por 5s → cria automaticamente um "follow-up pendente" + fecha.
 *
 * Ao confirmar: cria nova Activity com scheduledAt = data escolhida.
 * Prazo máximo: hoje + 3 dias úteis (SLA obrigatório).
 */

import { useState, useEffect, useCallback } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import {
  validateNextActionForm,
  addBusinessDays,
  getSuggestedNextActionDate,
  getMaxNextActionDate,
  REP_ACTIVITY_CONFIG,
  REP_ACTIVITY_TYPES,
  type RepActivityType,
  type NextActionFormData,
} from '../../utils/handoffUtils';

interface NextActionModalProps {
  dealId: string;
  contactName: string;
  companyName: string;
  /** Canal prioritário definido no handoff (pré-seleciona o tipo) */
  priorityChannel?: 'email' | 'whatsapp' | 'call';
  onSuccess: () => void;
  /** Chamado apenas se o modal auto-fechar após timeout (sem ação do usuário) */
  onAutoClose?: () => void;
}

const AUTO_CLOSE_SECONDS = 0; // 0 = sem auto-close (deve preencher)

export function NextActionModal({
  dealId, contactName, companyName, priorityChannel, onSuccess, onAutoClose,
}: NextActionModalProps) {
  const { user } = useAuthStore();

  const [type,       setType]       = useState<RepActivityType | ''>(priorityChannel || '');
  const [dateTime,   setDateTime]   = useState(getSuggestedNextActionDate());
  const [notes,      setNotes]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState<Partial<Record<keyof NextActionFormData, string>>>({});
  const [autoTimer,  setAutoTimer]  = useState(AUTO_CLOSE_SECONDS);

  const maxDate = getMaxNextActionDate(3);

  // Auto-close timer (se configurado)
  useEffect(() => {
    if (AUTO_CLOSE_SECONDS === 0) return;
    if (autoTimer <= 0) {
      createFollowUpPendente().then(() => onAutoClose?.());
      return;
    }
    const t = setTimeout(() => setAutoTimer(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [autoTimer]);

  const createFollowUpPendente = useCallback(async () => {
    if (!user?.tenantId) return;
    const scheduled = addBusinessDays(new Date(), 3);
    await addDoc(collection(db, 'tenants', user.tenantId, 'activities'), {
      dealId,
      userId: user.uid,
      type: priorityChannel || 'call',
      cadenceType: 'rep_followup',
      status: 'pending',
      scheduledAt: scheduled,
      dueAt: scheduled,
      notes: 'Follow-up pendente — criado automaticamente por falta de próxima ação.',
      coinsAwarded: 0,
      wasOnTime: false,
      overdueNotificationCount: 0,
      contactName,
      companyName,
      isAutoCreated: true,
      createdAt: new Date(),
    });
  }, [user, dealId, priorityChannel, contactName, companyName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = { type: type as RepActivityType, scheduledAt: dateTime, notes };
    const validation = validateNextActionForm(form, 3);
    if (!validation.valid) { setErrors(validation.errors); return; }
    if (!user?.tenantId) return;

    setSaving(true);
    try {
      const scheduled = new Date(dateTime);
      await addDoc(collection(db, 'tenants', user.tenantId, 'activities'), {
        dealId,
        userId: user.uid,
        type,
        cadenceType: 'rep_followup',
        status: 'pending',
        scheduledAt: scheduled,
        dueAt: scheduled,
        notes: notes.trim() || null,
        coinsAwarded: 0,
        wasOnTime: false,
        overdueNotificationCount: 0,
        contactName,
        companyName,
        createdAt: new Date(),
      });
      onSuccess();
    } catch (err) {
      console.error('[NextActionModal]', err);
      setErrors({ scheduledAt: 'Erro ao salvar. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 350 }}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>

        {/* Header — sem botão X (obrigatório) */}
        <div className="modal-hd" style={{ background: 'var(--primary-light)', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="ArrowRight" size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--primary)' }}>
                Qual a próxima ação? <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>(obrigatório)</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{contactName} · {companyName}</p>
            </div>
          </div>
          {AUTO_CLOSE_SECONDS > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
              Auto em {autoTimer}s
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Aviso de SLA */}
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FEF3C7', border: '1px solid #F59E0B44', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="AlertTriangle" size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, margin: 0, color: '#B45309' }}>
                O Rep deve sempre manter a próxima atividade agendada.
                <strong> Prazo máximo: 3 dias úteis.</strong>
              </p>
            </div>

            {/* Tipo de atividade */}
            <div>
              <div className="fl" style={{ marginBottom: 8 }}>Tipo da próxima ação *</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {REP_ACTIVITY_TYPES.map(t => {
                  const cfg = REP_ACTIVITY_CONFIG[t];
                  const selected = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setType(t); setErrors(p => ({ ...p, type: undefined })); }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '10px 8px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                        border: `1.5px solid ${selected ? cfg.color : 'var(--border)'}`,
                        background: selected ? `${cfg.color}12` : '#fff',
                      }}
                    >
                      <Icon name={cfg.icon} size={18} color={selected ? cfg.color : 'var(--text-2)'} />
                      <span style={{ fontSize: 11, fontWeight: selected ? 700 : 400, color: selected ? cfg.color : 'var(--text-primary)' }}>
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.type && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.type}</p>}
            </div>

            {/* Data e hora */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">
                Data e hora *
                <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>máx. {maxDate.slice(0, 10)}</span>
              </div>
              <input
                className="input"
                type="datetime-local"
                value={dateTime}
                min={new Date().toISOString().slice(0, 16)}
                max={maxDate}
                onChange={e => { setDateTime(e.target.value); setErrors(p => ({ ...p, scheduledAt: undefined })); }}
              />
              {errors.scheduledAt && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.scheduledAt}</p>}
            </div>

            {/* Notas (opcional) */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Notas <span className="muted" style={{ fontSize: 11 }}>(opcional)</span></div>
              <input
                className="input"
                placeholder="Ex: Confirmar proposta de preço, perguntar sobre prazo..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Preview de +1 moeda */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <span style={{ fontSize: 16 }}>🪙</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B45309' }}>
                +1 moeda ao concluir a atividade no prazo
              </span>
            </div>
          </div>

          <div className="modal-ft">
            <div style={{ flex: 1 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => createFollowUpPendente().then(() => onAutoClose?.())}
                style={{ color: 'var(--text-2)', fontSize: 12 }}
                disabled={saving}
              >
                Pular (criar follow-up automático)
              </button>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="Calendar" size={15} />
              {saving ? 'Agendando...' : 'Agendar próxima ação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NextActionModal;
