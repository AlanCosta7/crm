/**
 * MeetingActionModal.tsx — Agendar reunião de dentro do card
 *
 * Grava uma Activity {type:'meeting', scheduledAt} via useLogActivity.
 * A Cloud Function `onActivityScheduled` cria o evento no Google Calendar
 * automaticamente (quando o usuário tem o Calendar conectado) e preenche
 * calendarEventId. O registro no card acontece sem ação manual extra.
 */

import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import type { Contact, Deal } from '../../../types/crm';
import { useLogActivity } from './useLogActivity';

interface Props {
  deal: Deal;
  contacts: Contact[];
  onClose: () => void;
  onPoints: (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;
}

export function MeetingActionModal({ deal, contacts, onClose, onPoints }: Props) {
  const { logActivity } = useLogActivity(deal, onPoints);
  const contact = contacts.find(c => c.company === deal.company);

  const [title, setTitle] = useState(`Reunião — ${deal.name}`);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState<'presential' | 'video'>('video');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError('Informe a data da reunião.'); return; }
    setSaving(true);
    setError('');
    try {
      const scheduledAt = new Date(`${date}T${time || '09:00'}:00`);
      await logActivity({
        type: 'meeting',
        scheduledAt,
        contactId: contact?.id,
        outcome: title + (notes ? ` — ${notes}` : ''),
        extra: {
          visitType: type,
          durationMinutes: duration,
        },
      });
      onClose();
    } catch {
      setError('Erro ao agendar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 400 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="Calendar" size={17} color="#F59E0B" /> Agendar Reunião
          </h3>
          <button className="icon-btn" onClick={onClose}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Título *</div>
              <input className="input" required value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Data *</div>
                <input className="input" type="date" required value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Hora</div>
                <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Duração (min)</div>
                <input className="input" type="number" min="15" step="15" value={duration} onChange={e => setDuration(+e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Tipo</div>
              <div className="seg" style={{ width: '100%' }}>
                <button type="button" className={type === 'video' ? 'on' : ''} onClick={() => setType('video')} style={{ flex: 1 }}>
                  <Icon name="Video" size={14} /> Vídeo
                </button>
                <button type="button" className={type === 'presential' ? 'on' : ''} onClick={() => setType('presential')} style={{ flex: 1 }}>
                  <Icon name="MapPin" size={14} /> Presencial
                </button>
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Notas (opcional)</div>
              <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Pauta, link da call, etc." />
            </div>
            <p className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="Info" size={13} />
              Se o Google Calendar estiver conectado, o evento é criado automaticamente.
            </p>
            {error && <p style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>}
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="Calendar" size={15} />
              {saving ? 'Agendando...' : 'Agendar e registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
