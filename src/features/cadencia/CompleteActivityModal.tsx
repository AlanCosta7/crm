/**
 * CompleteActivityModal.tsx — Modal para registrar a conclusão de uma atividade SDR
 *
 * Campos:
 *  - outcome: resumo do que aconteceu (obrigatório)
 *  - clientResponseType: tipo de resposta do cliente
 *  - rescheduleNote: nota se o cliente pediu retorno
 *  - rescheduleDate: data sugerida para reagendamento (calcula +N dias úteis)
 *
 * Ao confirmar:
 *  1. Atualiza a activity no Firestore (status → completed, completedAt, coinsAwarded)
 *  2. Se reschedule → cria nova activity com scheduledAt = data escolhida
 */

import { useState } from 'react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { ACTIVITY_TYPE_CONFIG, type ActivityType } from '../../utils/cadenceUtils';
// businessDaysUntil disponível em crmFormat — usado via lógica inline abaixo

interface CompleteActivityModalProps {
  activityId: string;
  activityType: ActivityType;
  dealId: string;
  contactName: string;
  companyName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const RESPONSE_TYPES = [
  { value: 'interested',      label: '✅ Interessado — seguir em frente' },
  { value: 'not_now',         label: '⏰ Não agora — pediu retorno' },
  { value: 'not_interested',  label: '❌ Não tem interesse' },
  { value: 'no_response',     label: '📵 Sem resposta' },
] as const;

type ResponseType = typeof RESPONSE_TYPES[number]['value'];

export function CompleteActivityModal({
  activityId, activityType, dealId, contactName, companyName, onSuccess, onCancel,
}: CompleteActivityModalProps) {
  const { user } = useAuthStore();
  const cfg = ACTIVITY_TYPE_CONFIG[activityType];

  const [outcome,        setOutcome]       = useState('');
  const [responseType,   setResponseType]  = useState<ResponseType | ''>('');
  const [rescheduleNote, setRescheduleNote]= useState('');
  const [rescheduleDate, setRescheduleDate]= useState('');
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState('');

  // Sugestão de data de reagendamento = hoje + 3 dias úteis
  const suggestedDate = (() => {
    const d = new Date();
    let added = 0;
    while (added < 3) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return d.toISOString().slice(0, 10);
  })();

  const needsReschedule = responseType === 'not_now';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome.trim()) { setError('Descreva o que aconteceu na atividade.'); return; }
    if (!responseType)   { setError('Selecione o tipo de resposta do cliente.'); return; }
    if (needsReschedule && !rescheduleDate) { setError('Informe a data para o retorno.'); return; }
    if (!user?.tenantId) return;

    setSaving(true);
    setError('');

    try {
      const actRef = doc(db, 'tenants', user.tenantId, 'activities', activityId);

      // 1. Atualiza a activity como completada
      await updateDoc(actRef, {
        status: 'completed',
        completedAt: new Date(),
        outcome: outcome.trim(),
        clientResponseType: responseType,
        rescheduleNote: rescheduleNote.trim() || null,
        coinsAwarded: 1,
        wasOnTime: true,
        updatedAt: new Date(),
      });

      // 2. Se o cliente pediu retorno → cria activity futura de reagendamento
      if (needsReschedule && rescheduleDate) {
        const scheduledAt = new Date(rescheduleDate + 'T09:00:00');
        await addDoc(collection(db, 'tenants', user.tenantId, 'activities'), {
          dealId,
          userId: user.uid,
          type: activityType,
          cadenceType: 'smart_reschedule',
          status: 'pending',
          scheduledAt,
          dueAt: scheduledAt,
          rescheduleNote: rescheduleNote.trim(),
          coinsAwarded: 0,
          wasOnTime: false,
          overdueNotificationCount: 0,
          createdAt: new Date(),
          contactName,
          companyName,
        });
      }

      onSuccess();
    } catch (err) {
      console.error('[CompleteActivityModal]', err);
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={cfg.icon} size={18} color={cfg.color} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Registrar {cfg.label}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{contactName} · {companyName}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Fechar"><Icon name="X" size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Outcome */}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">O que aconteceu? *</div>
              <textarea
                className="input" rows={2}
                placeholder={`Ex: Enviei ${cfg.label.toLowerCase()} apresentando a solução, aguardando resposta...`}
                value={outcome}
                onChange={e => { setOutcome(e.target.value); setError(''); }}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Tipo de resposta */}
            <div>
              <div className="fl" style={{ marginBottom: 8 }}>Resposta do cliente *</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {RESPONSE_TYPES.map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s',
                      border: `1.5px solid ${responseType === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                      background: responseType === opt.value ? 'var(--primary-light)' : '#fff',
                    }}
                  >
                    <input type="radio" name="response" value={opt.value} checked={responseType === opt.value}
                      onChange={() => { setResponseType(opt.value); setError(''); }}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: responseType === opt.value ? 600 : 400, color: responseType === opt.value ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {opt.label}
                    </span>
                    {responseType === opt.value && <Icon name="Check" size={14} color="var(--primary)" style={{ marginLeft: 'auto' }} />}
                  </label>
                ))}
              </div>
            </div>

            {/* Reagendamento (só exibe se "Não agora") */}
            {needsReschedule && (
              <div style={{ padding: 14, borderRadius: 8, background: '#FEF3C7', border: '1px solid #F59E0B33', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: '#B45309' }}>
                  <Icon name="Calendar" size={16} color="#F59E0B" />
                  Agendar retorno
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl" style={{ fontSize: 12 }}>O que o cliente disse?</div>
                  <input className="input" placeholder='Ex: "Me liga em 15 dias"' value={rescheduleNote}
                    onChange={e => setRescheduleNote(e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl" style={{ fontSize: 12 }}>Data do retorno *</div>
                  <input className="input" type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={rescheduleDate || suggestedDate}
                    onChange={e => { setRescheduleDate(e.target.value); setError(''); }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                    Sugestão: {new Date(suggestedDate).toLocaleDateString('pt-BR')} (+3 dias úteis)
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="AlertTriangle" size={14} />
                {error}
              </div>
            )}

            {/* Preview de moedas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <span style={{ fontSize: 16 }}>🪙</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#B45309' }}>
                +1 moeda ao concluir no prazo
              </span>
            </div>
          </div>

          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="Check" size={16} />
              {saving ? 'Salvando...' : 'Concluir atividade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompleteActivityModal;
