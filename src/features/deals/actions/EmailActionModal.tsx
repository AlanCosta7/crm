/**
 * EmailActionModal.tsx — Enviar email de dentro do card
 *
 * Fase 1: abre o cliente de email do usuário (mailto:) com destinatário,
 * assunto e corpo pré-preenchidos, e registra a Activity {type:'email'}
 * automaticamente no card.
 *
 * Fase 2 (planejada): trocar o mailto: por envio real via Gmail API
 * (callable `sendEmail`, reaproveitando o OAuth do Google do Calendar).
 */

import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Icon } from '../../../components/ui/Icon';
import type { Contact, Deal, PlaybookTemplate } from '../../../types/crm';
import { useFirestoreCollection } from '../../../hooks/useFirestore';
import { useAuthStore } from '../../../stores/authStore';
import { functions } from '../../../config/firebase';
import { fmtCurrency } from '../../../utils/crmFormat';
import { renderTemplate } from '../../../utils/templateRender';
import { useLogActivity } from './useLogActivity';

interface Props {
  deal: Deal;
  contacts: Contact[];
  onClose: () => void;
  onPoints: (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;
}

export function EmailActionModal({ deal, contacts, onClose, onPoints }: Props) {
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

  const emailTemplates = templates.filter(t => t.activityType === 'email' && t.isActive);

  const [to, setTo] = useState(contact?.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fallback: abre o cliente de email local quando o Gmail não está conectado.
  const openMailto = () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = emailTemplates.find(t => t.id === id);
    if (t) {
      if (t.subject) setSubject(renderTemplate(t.subject, ctx));
      setBody(renderTemplate(t.body, ctx));
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) { setError('Informe o email do destinatário.'); return; }
    if (!subject.trim()) { setError('Informe o assunto.'); return; }
    if (!user?.tenantId) { setError('Sessão inválida.'); return; }
    setSaving(true);
    setError('');
    try {
      // Envio real via Gmail API (conta do próprio usuário).
      const sendEmail = httpsCallable(functions, 'sendEmail');
      await sendEmail({ tenantId: user.tenantId, to, subject, body, fromName: user.name });

      await logActivity({
        type: 'email',
        contactId: contact?.id,
        templateId: templateId || undefined,
        outcome: subject,
      });
      onClose();
    } catch (err: any) {
      // Gmail não conectado / sem permissão → oferece o fallback mailto:
      const code = err?.code || '';
      if (code.includes('failed-precondition') || code.includes('permission-denied')) {
        setError('Google não conectado para envio. Abrindo seu cliente de email como alternativa...');
        openMailto();
        try {
          await logActivity({ type: 'email', contactId: contact?.id, templateId: templateId || undefined, outcome: subject });
          onClose();
          return;
        } catch { /* segue exibindo erro abaixo */ }
      } else {
        setError(err?.message || 'Erro ao enviar. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 400 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="Mail" size={17} color="#1A6B1A" /> Enviar Email
          </h3>
          <button className="icon-btn" onClick={onClose}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSend}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Para *</div>
              <input className="input" type="email" required value={to} onChange={e => setTo(e.target.value)} placeholder="decisor@empresa.com" />
            </div>
            {emailTemplates.length > 0 && (
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Template</div>
                <select className="input" value={templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">— Escrever do zero —</option>
                  {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Assunto *</div>
              <input className="input" required value={subject} onChange={e => setSubject(e.target.value)} placeholder={`Proposta — ${deal.name}`} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Mensagem</div>
              <textarea className="input" rows={6} value={body} onChange={e => setBody(e.target.value)} placeholder={`Olá ${ctx.contato || ''}, ...`} />
            </div>
            <p className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="Info" size={13} />
              Enviado pela sua conta Google e registrado no card automaticamente. Se o Google não estiver conectado, abrimos seu cliente de email.
            </p>
            {error && <p style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>}
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="Mail" size={15} />
              {saving ? 'Registrando...' : 'Enviar e registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
