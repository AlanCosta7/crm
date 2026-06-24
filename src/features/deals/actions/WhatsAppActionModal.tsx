/**
 * WhatsAppActionModal.tsx — Enviar WhatsApp de dentro do card
 *
 * Abre o wa.me com número e mensagem pré-preenchidos (deep-link, gratuito) e
 * registra a Activity {type:'whatsapp', status:'completed'} automaticamente.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import type { Contact, Deal, PlaybookTemplate } from '../../../types/crm';
import { useFirestoreCollection } from '../../../hooks/useFirestore';
import { useAuthStore } from '../../../stores/authStore';
import { fmtCurrency } from '../../../utils/crmFormat';
import { renderTemplate } from '../../../utils/templateRender';
import { useLogActivity } from './useLogActivity';

interface Props {
  deal: Deal;
  contacts: Contact[];
  onClose: () => void;
  onPoints: (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;
}

/** Normaliza o número para o formato wa.me (só dígitos, com DDI 55 por padrão). */
function toWaNumber(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 11) d = '55' + d; // assume Brasil quando não há DDI
  return d;
}

export function WhatsAppActionModal({ deal, contacts, onClose, onPoints }: Props) {
  const { user } = useAuthStore();
  const { logActivity } = useLogActivity(deal, onPoints);
  const { data: templates } = useFirestoreCollection<PlaybookTemplate>('templates');

  const contact = contacts.find(c => c.company === deal.company);
  const prodLabel = deal.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart';

  const ctx = useMemo(() => ({
    contato: contact?.name ?? '',
    empresa: deal.company,
    vendedor: user?.name ?? '',
    negocio: deal.name,
    valor: fmtCurrency(deal.value),
    produto: prodLabel,
  }), [contact, deal, user, prodLabel]);

  const waTemplates = templates.filter(t => t.activityType === 'whatsapp' && t.isActive);

  const [phone, setPhone] = useState(contact?.whats || contact?.phone || '');
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = waTemplates.find(t => t.id === id);
    if (t) setMessage(renderTemplate(t.body, ctx));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = toWaNumber(phone);
    if (!num) { setError('Informe um número de WhatsApp válido.'); return; }
    if (!message.trim()) { setError('Escreva a mensagem.'); return; }
    setSaving(true);
    setError('');
    try {
      const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      await logActivity({
        type: 'whatsapp',
        contactId: contact?.id,
        templateId: templateId || undefined,
        outcome: message.slice(0, 140),
      });
      onClose();
    } catch {
      setError('Erro ao registrar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 400 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="MessageCircle" size={17} color="#25D366" /> Enviar WhatsApp
          </h3>
          <button className="icon-btn" onClick={onClose}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSend}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Número (WhatsApp) *</div>
              <input className="input" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            {waTemplates.length > 0 && (
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Template</div>
                <select className="input" value={templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">— Escrever do zero —</option>
                  {waTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Mensagem *</div>
              <textarea className="input" rows={5} required value={message} onChange={e => setMessage(e.target.value)} placeholder={`Olá ${ctx.contato || ''}, ...`} />
            </div>
            <p className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="Info" size={13} />
              Abre o WhatsApp com a mensagem pronta e registra a atividade no card.
            </p>
            {error && <p style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>}
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#25D366', borderColor: '#25D366' }}>
              <Icon name="MessageCircle" size={15} />
              {saving ? 'Registrando...' : 'Abrir e registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
