/**
 * ContactSelector.tsx — Vínculo de Contato no Card de negócio (aba Visão Geral)
 *
 * Resolve o achado crítico da investigação de templates (PLANO_DESENHO_CRM.md,
 * 13/09/2026): os modais de Email/WhatsApp resolviam o contato por
 * `contacts.find(c => c.company === deal.company)`, um match de string frágil
 * (variação de grafia, empresas homônimas). Este seletor grava o vínculo
 * explícito em `deal.contactId` — ver utils/dealContact.ts para a resolução.
 */

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import type { Contact, Deal } from '../../types/crm';
import { resolveDealContact, contactsForDealCompany } from '../../utils/dealContact';

export interface NewContactInput {
  name: string;
  email: string;
  phone: string;
  whats: string;
  role: string;
}

interface ContactSelectorProps {
  deal: Pick<Deal, 'company' | 'contactId'>;
  contacts: Contact[];
  onLink: (contactId: string) => Promise<void>;
  onCreateContact: (data: NewContactInput) => Promise<string>;
  /** viewer/design não editam — só visualizam o contato já vinculado */
  readOnly?: boolean;
}

export function ContactSelector({ deal, contacts, onLink, onCreateContact, readOnly }: ContactSelectorProps) {
  const [mode, setMode] = useState<'view' | 'picking' | 'creating'>('view');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWhats, setNewWhats] = useState('');
  const [newRole, setNewRole] = useState('');

  const linkedContact = resolveDealContact(deal, contacts);
  const candidates = contactsForDealCompany(deal, contacts).filter(c => c.id !== linkedContact?.id);

  const resetCreateForm = () => {
    setNewName(''); setNewEmail(''); setNewPhone(''); setNewWhats(''); setNewRole('');
  };

  const cancelEditing = () => {
    setMode('view');
    setError('');
    resetCreateForm();
  };

  const handlePick = async (contactId: string) => {
    setSaving(true);
    setError('');
    try {
      await onLink(contactId);
      setMode('view');
    } catch {
      setError('Não foi possível vincular o contato. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) { setError('Informe o nome do contato.'); return; }
    setSaving(true);
    setError('');
    try {
      const newId = await onCreateContact({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        whats: newWhats.trim() || newPhone.trim(),
        role: newRole.trim(),
      });
      await onLink(newId);
      resetCreateForm();
      setMode('view');
    } catch {
      setError('Não foi possível criar o contato. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'view') {
    return (
      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: linkedContact ? 10 : 8 }}>
          <div className="label" style={{ fontSize: 10.5 }}>Contato vinculado</div>
          {!readOnly && (
            <button className="btn btn-outline btn-sm" onClick={() => setMode('picking')}>
              <Icon name="Link2" size={13} /> {linkedContact ? 'Trocar' : 'Vincular contato'}
            </button>
          )}
        </div>
        {linkedContact ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{linkedContact.name}</div>
            {linkedContact.role && <div className="muted" style={{ fontSize: 11.5 }}>{linkedContact.role}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {linkedContact.email && (
                <div className="row" style={{ gap: 6, fontSize: 12.5 }}>
                  <Icon name="Mail" size={13} color="var(--text-2)" /> {linkedContact.email}
                </div>
              )}
              {linkedContact.whats && (
                <div className="row" style={{ gap: 6, fontSize: 12.5 }}>
                  <Icon name="MessageCircle" size={13} color="var(--text-2)" /> {linkedContact.whats}
                </div>
              )}
              {!linkedContact.whats && linkedContact.phone && (
                <div className="row" style={{ gap: 6, fontSize: 12.5 }}>
                  <Icon name="Phone" size={13} color="var(--text-2)" /> {linkedContact.phone}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            Nenhum contato vinculado. O envio de email/WhatsApp não terá destinatário pré-preenchido.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="label" style={{ fontSize: 10.5 }}>
          {mode === 'creating' ? 'Novo contato' : 'Vincular contato'}
        </div>
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={cancelEditing} aria-label="Cancelar">
          <Icon name="X" size={14} />
        </button>
      </div>

      {mode === 'picking' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>Nenhum outro contato cadastrado para {deal.company}.</p>
          ) : candidates.map(c => (
            <button
              key={c.id}
              type="button"
              className="btn btn-outline btn-sm"
              style={{ justifyContent: 'flex-start' }}
              disabled={saving}
              onClick={() => handlePick(c.id)}
            >
              <Icon name="User" size={13} />
              {c.name}{c.email ? ` · ${c.email}` : ''}
            </button>
          ))}
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 4, alignSelf: 'flex-start' }} onClick={() => { setMode('creating'); setError(''); }}>
            <Icon name="Plus" size={13} /> Novo contato
          </button>
        </div>
      )}

      {mode === 'creating' && (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="input" placeholder="Nome *" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <input className="input" type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
          <input className="input" placeholder="Telefone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
          <input className="input" placeholder="WhatsApp" value={newWhats} onChange={e => setNewWhats(e.target.value)} />
          <input className="input" placeholder="Cargo" value={newRole} onChange={e => setNewRole(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            <Icon name="Check" size={13} /> {saving ? 'Salvando...' : 'Criar e vincular'}
          </button>
        </form>
      )}

      {error && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export default ContactSelector;
