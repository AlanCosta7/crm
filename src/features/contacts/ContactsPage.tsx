/**
 * ContactsPage.tsx — CRUD de contatos com filtro multi-produto.
 * O filtro de produto lê productId do uiStore e filtra contacts.productIds[].
 */
import React, { useState } from 'react';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Contact, Deal, Stage, Seller } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { fmtCurrency, sellerById, stageById } from '../../utils/crmFormat';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { matchesProductId, matchesProductIds, productIdsForNewEntity } from '../../utils/productScope';

export function ContactsPage() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [filter, setFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { user } = useAuthStore();
  
  // Triggers do Firestore enlaçados com listeners em tempo real (Fase 2)
  const { data: contacts, loading } = useFirestoreCollection<Contact>('contacts');
  const { data: deals } = useFirestoreCollection<Deal>('deals');
  const { data: stages } = useFirestoreCollection<Stage>('stages');
  const { data: sellers } = useFirestoreCollection<Seller>('sellers');
  const { addDocument } = useFirestoreMutations('contacts');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWhats, setNewWhats] = useState('');
  const [newRole, setNewRole] = useState('Diretor de Compras');

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newCompany) return;

    const newContactData = {
      name: newName,
      company: newCompany,
      email: newEmail,
      phone: newPhone,
      whats: newWhats || newPhone,
      role: newRole,
      owner: user?.uid || '',
      productIds: productIdsForNewEntity(productScope, user),
      last: 'agora',
      tags: ['Novo'],
      deals: 0,
    };

    try {
      await addDocument(newContactData);
      setIsModalOpen(false);
      // Limpa formulário
      setNewName('');
      setNewCompany('');
      setNewEmail('');
      setNewPhone('');
      setNewWhats('');
    } catch (err) {
      console.error(err);
    }
  };

  const getSellerById = (id: string) => {
    return sellerById(sellers, id);
  };

  const getStageById = (id: string) => {
    return stageById(stages, id);
  };

  // Filtros de contatos (com multi-produto)
  const getFilteredContacts = () => {
    let result = [...contacts];

    result = result.filter(c => matchesProductIds(productScope, c.productIds?.length ? c.productIds : ['wizmart']));

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        c =>
          c.name.toLowerCase().includes(term) ||
          c.company.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term)
      );
    }

    if (filter === 'Meus contatos') {
      result = result.filter(c => c.owner === user?.uid);
    } else if (filter === 'Sem negócio') {
      result = result.filter(c => c.deals === 0);
    } else if (filter === 'Adicionados hoje') {
      result = result.filter(c => c.last === 'agora' || c.last.includes('horas'));
    }

    return result;
  };

  const filteredContacts = getFilteredContacts();

  // render subpage contact detail
  if (selectedContact) {
    const c = selectedContact;
    const contactDeals = deals.filter(d => d.company === c.company && matchesProductId(productScope, d.productId || 'wizmart')).slice(0, 3);
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Breadcrumb de subpágina */}
        <div className="crumb" style={{ marginBottom: 6 }}>
          <button onClick={() => setSelectedContact(null)} className="tlink row" style={{ gap: 4 }}>
            <Icon name="ArrowLeft" size={14} />
            Voltar para Contatos
          </button>
        </div>

        <h1 className="h1">{c.name}</h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          {/* Profile Card */}
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="row" style={{ gap: 14 }}>
              <Av name={c.name} size={64} color="var(--primary)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{c.role}</div>
              </div>
            </div>
            <span className="badge badge-primary" style={{ alignSelf: 'flex-start' }}>
              <Icon name="Building2" size={12} />
              <span style={{ marginLeft: 4 }}>{c.company}</span>
            </span>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { ic: 'Mail', v: c.email, col: 'var(--text-2)' },
                { ic: 'Phone', v: c.phone, col: 'var(--text-2)' },
                { ic: 'MessageCircle', v: c.whats, col: '#25D366' },
              ].map(({ ic, v, col }, i) => (
                <div key={i} className="row" style={{ gap: 10, fontSize: 13 }}>
                  <Icon name={ic} size={16} color={col} />
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="label" style={{ marginBottom: 7 }}>Tags</div>
              <div className="chips">
                {c.tags.map(t => (
                  <span key={t} className="badge badge-accent">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn btn-primary" style={{ justifyContent: 'center' }}>
                <Icon name="Plus" size={16} />
                Novo Negócio
              </button>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                  Nova Atividade
                </button>
                <button className="btn btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                  Editar
                </button>
              </div>
            </div>
          </div>

          {/* Tabs Panel */}
          <DetailTabsPanel contact={c} contactDeals={contactDeals} getStageById={getStageById} />
        </div>
      </div>
    );
  }

  const chips = ['Todos', 'Meus contatos', 'Sem negócio', 'Adicionados hoje'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Sub-Topbar */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="h1">Contatos</h1>
          <span className="badge badge-gray" style={{ height: 24 }}>
            {filteredContacts.length}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="row search" style={{ maxWidth: 220, margin: 0 }}>
            <span className="ic">
              <Icon name="Search" size={14} />
            </span>
            <input
              style={{ height: 32 }}
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn btn-outline btn-sm">
            <Icon name="SlidersHorizontal" size={15} />
            Filtrar
          </button>
          <button className="btn btn-outline btn-sm">
            <Icon name="Upload" size={15} />
            Importar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
            <Icon name="Plus" size={15} />
            Novo Contato
          </button>
        </div>
      </div>

      {/* Filtros rápidos chips */}
      <div className="chips">
        {chips.map(c => (
          <button
            key={c}
            className={`chip ${filter === c ? 'on' : ''}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Tabela de Contatos */}
      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }} className="muted">
            <span className="sk" style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', marginRight: 8 }} />
            Carregando contatos...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon name="Users" size={38} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600 }} className="muted">Nenhum contato encontrado</div>
          </div>
        ) : (
          <table className="tbl" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                {['Contato', 'Empresa', 'Email', 'Telefone', 'WhatsApp', 'Responsável', 'Última atividade', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c, i) => {
                const s = getSellerById(c.owner);
                // Cores acessíveis de avatar alternadas
                const colors = ['#1A6B1A', '#415400', '#0E7490', '#9333EA', '#DB2777'];
                return (
                  <tr key={c.id} className={i % 2 ? 'alt' : ''}>
                    <td>
                      <div className="row" style={{ gap: 9 }}>
                        <Av name={c.name} size={30} color={colors[i % colors.length]} />
                        <button onClick={() => setSelectedContact(c)} className="tlink">
                          {c.name}
                        </button>
                      </div>
                    </td>
                    <td className="muted">{c.company}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{c.email}</td>
                    <td className="muted tnum">{c.phone}</td>
                    <td>
                      <span className="row" style={{ gap: 5, color: '#25D366', fontWeight: 600, fontSize: 12.5 }}>
                        <Icon name="MessageCircle" size={14} />
                        {c.whats}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 7 }}>
                        <Av initials={s.initials} color={s.color} size={24} />
                        <span style={{ fontSize: 12.5 }}>{s.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{c.last}</td>
                    <td>
                      <button
                        className="icon-btn"
                        style={{ width: 30, height: 30 }}
                        onClick={() => setSelectedContact(c)}
                      >
                        <Icon name="ArrowUpRight" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Paginação do rodapé do grid */}
        <div className="row" style={{ justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            1–{filteredContacts.length} de {filteredContacts.length} contatos
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" disabled>
              <Icon name="ChevronLeft" size={16} />
              Anterior
            </button>
            {['1'].map(p => (
              <button
                key={p}
                className="btn btn-sm btn-primary"
                style={{ minWidth: 32, justifyContent: 'center', padding: 0 }}
              >
                {p}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" disabled>
              Próxima
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal - Novo Contato */}
      {isModalOpen && (
        <div className="modal-ov" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Cadastrar Novo Contato</h3>
              <button className="icon-btn" onClick={() => setIsModalOpen(false)} aria-label="Fechar modal">
                <Icon name="X" size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateContact}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome do contato *</div>
                  <input
                    className="input"
                    required
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Empresa vinculada *</div>
                  <input
                    className="input"
                    required
                    value={newCompany}
                    onChange={e => setNewCompany(e.target.value)}
                    placeholder="Razão social ou nome fantasia"
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Cargo</div>
                  <input
                    className="input"
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    placeholder="Cargo comercial"
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">E-mail corporativo</div>
                  <input
                    className="input"
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="ex: contato@empresa.com"
                  />
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <div className="field" style={{ margin: 0, flex: 1 }}>
                    <div className="fl">Telefone</div>
                    <input
                      className="input"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="(11) 99999-0000"
                    />
                  </div>
                  <div className="field" style={{ margin: 0, flex: 1 }}>
                    <div className="fl">WhatsApp</div>
                    <input
                      className="input"
                      value={newWhats}
                      onChange={e => setNewWhats(e.target.value)}
                      placeholder="(11) 99999-0000"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  <Icon name="Plus" size={16} />
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponente de abas de detalhe (Deals, Activities, Company)
function DetailTabsPanel({ contact, contactDeals, getStageById }: { contact: Contact; contactDeals: Deal[]; getStageById: (id: string) => Stage }) {
  const [tab, setTab] = useState('deals');

  const dealsTab = () => (
    <table className="tbl">
      <thead>
        <tr>
          {['Negócio', 'Valor', 'Estágio', 'Vencimento', ''].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {contactDeals.length === 0 ? (
          <tr>
            <td colSpan={5} style={{ padding: '30px 0', textAlign: 'center' }} className="muted">
              Nenhum negócio associado a esta empresa.
            </td>
          </tr>
        ) : (
          contactDeals.map(d => {
            const st = getStageById(d.stage);
            return (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="money">{fmtCurrency(d.value)}</td>
                <td>
                  <span className="badge badge-primary">{st.name}</span>
                </td>
                <td className="muted">{d.due}</td>
                <td>
                  <Icon name="ChevronRight" size={16} color="#9aa3af" />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const actIcon = {
    email: { i: 'Mail', c: '#1A6B1A' },
    whatsapp: { i: 'MessageCircle', c: '#25D366' },
    call: { i: 'Phone', c: '#F59E0B' },
    note: { i: 'StickyNote', c: '#6B7280' },
  };

  const acts = [
    { type: 'whatsapp' as const, text: 'WhatsApp respondido — confirmou interesse na renovação', time: 'há 2 horas' },
    { type: 'email' as const, text: 'Enviado catálogo de produtos atualizado', time: 'ontem' },
    { type: 'call' as const, text: 'Ligação — alinhamento de prazos de entrega', time: 'há 3 dias' },
  ];

  const actsTab = () => (
    <div className="tl" style={{ padding: '20px' }}>
      {acts.map((a, i) => {
        const ic = actIcon[a.type];
        return (
          <div key={i} className="tl-item">
            <div className="tl-ic" style={{ background: ic.c }}>
              <Icon name={ic.i} size={15} />
            </div>
            <div className="tl-body">
              <div>{a.text}</div>
              <div className="tl-time">{a.time}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const compTab = () => (
    <div className="card-pad" style={{ padding: 24 }}>
      <div className="row" style={{ gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
          }}
        >
          <Icon name="Building2" size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{contact.company}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Cliente desde 2023 · Varejo e Distribuição
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: Record<string, () => React.ReactNode> = {
    deals: dealsTab,
    activities: actsTab,
    companies: compTab,
  };

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="tabs" style={{ padding: '0 12px' }}>
        {[
          ['deals', 'Negócios'],
          ['activities', 'Atividades'],
          ['companies', 'Empresas'],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`tab ${tab === k ? 'active' : ''}`}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tabs[tab]()}
    </div>
  );
}

export default ContactsPage;
