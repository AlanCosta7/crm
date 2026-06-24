/**
 * SettingsPage.tsx — Configurações administrativas do WizMart CRM
 * Abas: Usuários · Pipelines · Integrações · Plano
 *
 * A aba Pipelines permite ao admin criar, renomear, reordenar estágios
 * e configurar as flags de convergência/handoff dinamicamente.
 */

import React, { useState } from 'react';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { SettingUser, Stage, Funnel, FunnelStage, FunnelType, UserRole, ProductId, CommissionTier } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { sortedStages } from '../../utils/funnelUtils';
import { CalendarPane } from './CalendarPane';

// ── PipelinesPane ─────────────────────────────────────────────────────────────
function PipelinesPane() {
  const { data: funnels } = useFirestoreCollection<Funnel>('funnels');
  const { updateDocument: updateFunnel, addDocument: addFunnel } = useFirestoreMutations('funnels');

  const [selectedFunnelId, setSelectedFunnelId] = useState<string>('');
  const [_editingStage, _setEditingStage] = useState<FunnelStage | null>(null);
  const [showNewStage, setShowNewStage] = useState(false);
  const [showNewFunnel, setShowNewFunnel] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<Funnel | null>(null);

  // Formulário de novo estágio
  const [stgName, setStgName] = useState('');
  const [stgSla,  setStgSla]  = useState(0);
  const [stgConv, setStgConv] = useState(false);
  const [stgHand, setStgHand] = useState(false);
  const [stgCoins,setStgCoins]= useState(0);

  // Formulário de novo funil
  const [fnName, setFnName] = useState('');
  const [fnType, setFnType] = useState<FunnelType>('inbound');
  const [fnProd, setFnProd] = useState<'wizmart' | 'smart_cafe'>('wizmart');

  const activeFunnels   = funnels.filter(f => f.isActive !== false);
  const archivedFunnels = funnels.filter(f => f.isActive === false);
  const activeFunnel = funnels.find(f => f.id === selectedFunnelId) || activeFunnels[0];
  const isArchived = activeFunnel ? activeFunnel.isActive === false : false;
  const stages = activeFunnel ? sortedStages(activeFunnel) : [];

  const handleArchiveFunnel = async (f: Funnel) => {
    await updateFunnel(f.id, { isActive: false });
    setArchiveConfirm(null);
    if (selectedFunnelId === f.id) setSelectedFunnelId('');
  };

  const handleRestoreFunnel = async (f: Funnel) => {
    await updateFunnel(f.id, { isActive: true });
  };

  const FUNNEL_ICONS: Record<FunnelType, string> = {
    inbound: 'Download', outbound: 'Upload', hunter: 'Target', main: 'Workflow',
  };

  const handleSaveNewStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stgName.trim() || !activeFunnel) return;
    const newStage: FunnelStage = {
      id: stgName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name: stgName.trim(),
      order: stages.length + 1,
      isConvergencePoint: stgConv,
      isHandoffRequired: stgHand,
      coinsOnEnter: stgCoins,
      slaBusinessDays: stgSla,
      defaultTemplateIds: [],
    };
    await updateFunnel(activeFunnel.id, { stages: [...stages, newStage] });
    setStgName(''); setStgSla(0); setStgConv(false); setStgHand(false); setStgCoins(0);
    setShowNewStage(false);
  };

  const handleToggleFlag = async (stage: FunnelStage, flag: 'isConvergencePoint' | 'isHandoffRequired') => {
    if (!activeFunnel) return;
    const updated = stages.map(s => s.id === stage.id ? { ...s, [flag]: !s[flag] } : s);
    await updateFunnel(activeFunnel.id, { stages: updated });
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!activeFunnel) return;
    if (!confirm('Remover este estágio? Os deals nele serão mantidos, mas o estágio não aparecerá mais no Kanban.')) return;
    await updateFunnel(activeFunnel.id, { stages: stages.filter(s => s.id !== stageId) });
  };

  const handleMoveStage = async (stageId: string, dir: 'up' | 'down') => {
    if (!activeFunnel) return;
    const idx = stages.findIndex(s => s.id === stageId);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === stages.length - 1) return;
    const reordered = [...stages];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    reordered.forEach((s, i) => { s.order = i + 1; });
    await updateFunnel(activeFunnel.id, { stages: reordered });
  };

  const handleCreateFunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fnName.trim()) return;
    await addFunnel({
      name: fnName.trim(), type: fnType, productId: fnProd,
      color: fnType === 'hunter' ? '#B91C1C' : fnType === 'inbound' ? '#1A6B1A' : '#8DB600',
      isActive: true, stages: [],
    });
    setFnName(''); setShowNewFunnel(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Sidebar de funis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)', marginBottom: 4 }}>
          Funis configurados
        </div>
        {activeFunnels.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedFunnelId(f.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8,
              border: `1.5px solid ${(activeFunnel?.id === f.id) ? f.color : 'var(--border)'}`,
              background: (activeFunnel?.id === f.id) ? `${f.color}10` : '#fff',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <Icon name={FUNNEL_ICONS[f.type]} size={15} color={f.color} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: f.color }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{f.stages.length} estágios</div>
            </div>
          </button>
        ))}
        <button className="btn btn-outline btn-sm" style={{ justifyContent: 'center', marginTop: 4 }} onClick={() => setShowNewFunnel(true)}>
          <Icon name="Plus" size={14} />Novo Funil
        </button>

        {/* Funis arquivados */}
        {archivedFunnels.length > 0 && (
          <>
            <button
              onClick={() => setShowArchived(v => !v)}
              className="btn btn-ghost btn-sm"
              style={{ justifyContent: 'space-between', marginTop: 8, color: 'var(--text-2)', fontSize: 12 }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="Archive" size={13} />Arquivados ({archivedFunnels.length})
              </span>
              <Icon name={showArchived ? 'ChevronUp' : 'ChevronDown'} size={14} />
            </button>
            {showArchived && archivedFunnels.map(f => (
              <div
                key={f.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8,
                  border: '1.5px dashed var(--border)', background: 'var(--bg-2)', opacity: 0.85,
                }}
              >
                <Icon name={FUNNEL_ICONS[f.type]} size={14} color="var(--text-2)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{f.stages.length} estágios</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleRestoreFunnel(f)} title="Restaurar funil">
                  <Icon name="RotateCcw" size={13} />Restaurar
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Editor de estágios */}
      <div>
        {!activeFunnel ? (
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <p className="muted">Selecione um funil ao lado para editar seus estágios.</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-hd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3>{activeFunnel.name}</h3>
                <span className="badge badge-gray">{stages.length} estágios</span>
                {isArchived && <span className="badge" style={{ background: '#FEF3C7', color: '#B45309' }}>Arquivado</span>}
              </div>
              {isArchived ? (
                <button className="btn btn-outline btn-sm" onClick={() => handleRestoreFunnel(activeFunnel)}>
                  <Icon name="RotateCcw" size={14} />Restaurar
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setArchiveConfirm(activeFunnel)} title="Arquivar funil (não exclui definitivamente)">
                  <Icon name="Archive" size={14} />Arquivar
                </button>
              )}
            </div>
            <div style={{ padding: '0 0 4px' }}>
              {stages.map((st, i) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  {/* Reordenação */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button className="icon-btn" style={{ width: 22, height: 22, opacity: i === 0 ? 0.3 : 1 }} onClick={() => handleMoveStage(st.id, 'up')} disabled={i === 0}>
                      <Icon name="ChevronUp" size={13} />
                    </button>
                    <button className="icon-btn" style={{ width: 22, height: 22, opacity: i === stages.length - 1 ? 0.3 : 1 }} onClick={() => handleMoveStage(st.id, 'down')} disabled={i === stages.length - 1}>
                      <Icon name="ChevronDown" size={13} />
                    </button>
                  </div>

                  {/* Info do estágio */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{st.name}</span>
                      {st.isConvergencePoint && <span title="Ponto de convergência" style={{ fontSize: 14 }}>⚡</span>}
                      {st.isHandoffRequired  && <span title="Handoff obrigatório"   style={{ fontSize: 14 }}>🤝</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                      {st.slaBusinessDays > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>SLA: {st.slaBusinessDays}d úteis</span>}
                      {st.coinsOnEnter > 0    && <span className="badge" style={{ fontSize: 10, background: '#FEF3C7', color: '#B45309' }}>+{st.coinsOnEnter} 🪙</span>}
                    </div>
                  </div>

                  {/* Flags toggle */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${st.isConvergencePoint ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handleToggleFlag(st, 'isConvergencePoint')}
                      title="Ponto de convergência — move deal para o funil Hunter"
                      style={{ fontSize: 11 }}
                    >⚡ Conv.</button>
                    <button
                      className={`btn btn-sm ${st.isHandoffRequired ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => handleToggleFlag(st, 'isHandoffRequired')}
                      title="Handoff obrigatório — exige formulário de passagem de bastão"
                      style={{ fontSize: 11 }}
                    >🤝 Handoff</button>
                    <button className="icon-btn" style={{ color: 'var(--danger)', width: 30, height: 30 }} onClick={() => handleDeleteStage(st.id)} title="Remover estágio">
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Botão add estágio */}
              <div style={{ padding: '12px 20px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setShowNewStage(true)}>
                  <Icon name="Plus" size={14} />Adicionar estágio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal novo estágio */}
      {showNewStage && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowNewStage(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Adicionar Estágio</h3>
              <button className="icon-btn" onClick={() => setShowNewStage(false)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleSaveNewStage}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome do estágio *</div>
                  <input className="input" required value={stgName} onChange={e => setStgName(e.target.value)} placeholder="Ex: Qualificação SDR" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">SLA (dias úteis)</div>
                    <input className="input" type="number" min="0" value={stgSla} onChange={e => setStgSla(+e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Moedas ao entrar</div>
                    <input className="input" type="number" min="0" value={stgCoins} onChange={e => setStgCoins(+e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={stgConv} onChange={e => setStgConv(e.target.checked)} />
                    <span style={{ fontSize: 13 }}>⚡ Ponto de convergência (cria deal no Hunter)</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={stgHand} onChange={e => setStgHand(e.target.checked)} />
                    <span style={{ fontSize: 13 }}>🤝 Handoff obrigatório (exige formulário)</span>
                  </label>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewStage(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Icon name="Plus" size={16} />Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmar arquivamento */}
      {archiveConfirm && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setArchiveConfirm(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Arquivar funil</h3>
              <button className="icon-btn" onClick={() => setArchiveConfirm(null)}><Icon name="X" size={18} /></button>
            </div>
            <div className="modal-bd">
              <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="Archive" size={20} color="#B45309" />
                </div>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Arquivar "{archiveConfirm.name}"?</p>
                  <p className="muted" style={{ fontSize: 13 }}>
                    O funil deixa de aparecer no Pipeline, mas <strong>não é excluído</strong>. Os negócios são preservados e você pode restaurá-lo a qualquer momento em "Arquivados".
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={() => setArchiveConfirm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => handleArchiveFunnel(archiveConfirm)}>
                <Icon name="Archive" size={15} />Arquivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo funil */}
      {showNewFunnel && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowNewFunnel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Novo Funil</h3>
              <button className="icon-btn" onClick={() => setShowNewFunnel(false)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleCreateFunnel}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome do funil *</div>
                  <input className="input" required value={fnName} onChange={e => setFnName(e.target.value)} placeholder="Ex: Inbound Tráfego Pago" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Tipo</div>
                    <select className="input" value={fnType} onChange={e => setFnType(e.target.value as FunnelType)}>
                      <option value="inbound">Inbound</option>
                      <option value="outbound">Outbound</option>
                      <option value="hunter">Hunter</option>
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Produto</div>
                    <select className="input" value={fnProd} onChange={e => setFnProd(e.target.value as 'wizmart' | 'smart_cafe')}>
                      <option value="wizmart">WizMart</option>
                      <option value="smart_cafe">Smart Café</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewFunnel(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Icon name="Plus" size={16} />Criar Funil</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const getRoleBadgeClass = (roleId: string) => {
  const r = roleId.toLowerCase();
  if (r === 'master') return 'badge-primary';
  if (r.includes('manager') || r.includes('gestor')) return 'badge-gray';
  if (r.includes('sdr')) return 'badge-warn';
  if (r.includes('rep') || r.includes('representante')) return 'badge-danger';
  if (r.includes('bdr')) return 'badge-accent';
  return 'badge-gray';
};

export function SettingsPage() {
  const [tab, setTab] = useState<'empresa' | 'usuarios' | 'perfis' | 'pipelines' | 'calendar' | 'integracoes' | 'plano'>('usuarios');

  // Firestore sync bindings
  const { data: users, loading: loadingUsers } = useFirestoreCollection<SettingUser>('users');
  // stages legado — mantido para compatibilidade, usado em outros panes se necessário
  const { data: _stages } = useFirestoreCollection<Stage>('stages');
  
  // Ouve o status de importação do Moskit do Firestore
  const { data: importDocs } = useFirestoreCollection<any>('settings');
  const moskitDoc = importDocs.find(d => d.id === 'moskit_import');

  // Firestore sync para Perfis (Roles)
  const { data: dbRoles } = useFirestoreCollection<any>('roles');
  const { setDocument: saveRole, deleteDocument: deleteRole } = useFirestoreMutations('roles');
  
  const { addDocument, updateDocument } = useFirestoreMutations('settings');
  const { addDocument: addUser, updateDocument: updateUser, deleteDocument: deleteUser } = useFirestoreMutations('users');

  // Perfis padrão do sistema
  const DEFAULT_ROLES = [
    { id: 'master', name: 'Admin Master', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_cadence',
      'view_activities', 'view_handoffs', 'view_tasks', 'view_leaderboard', 'view_carteira',
      'view_loja', 'view_kpi_reports', 'view_admin_settings', 'view_management_dashboard'
    ] },
    { id: 'manager', name: 'Gestor', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_activities',
      'view_tasks', 'view_leaderboard', 'view_carteira', 'view_loja', 'view_kpi_reports',
      'view_management_dashboard'
    ] },
    { id: 'sdr', name: 'SDR', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_cadence', 'view_activities',
      'view_leaderboard', 'view_carteira', 'view_loja', 'view_sdr_dashboard'
    ] },
    { id: 'rep', name: 'Representante', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_handoffs', 'view_leaderboard',
      'view_carteira', 'view_loja', 'view_rep_dashboard'
    ] },
    { id: 'bdr', name: 'BDR', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_leaderboard', 'view_carteira',
      'view_loja', 'view_bdr_dashboard'
    ] },
    { id: 'viewer', name: 'Visualizador', permissions: [
      'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_kpi_reports',
      'view_viewer_dashboard'
    ] },
  ];

  // Mescla perfis padrão com dados do banco
  const mergedRoles = [...DEFAULT_ROLES];
  dbRoles.forEach(r => {
    const idx = mergedRoles.findIndex(x => x.id === r.id);
    if (idx !== -1) {
      mergedRoles[idx] = { ...mergedRoles[idx], ...r };
    } else {
      mergedRoles.push(r);
    }
  });

  const getRoleLabel = (roleId: string) => {
    const role = mergedRoles.find(r => r.id === roleId);
    return role ? role.name : roleId;
  };

  // Estados locais para usuários
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('rep');
  const [inviteProducts, setInviteProducts] = useState<ProductId[]>(['wizmart']);
  const [inviteTier, setInviteTier] = useState<CommissionTier>('junior');

  const [selectedUser, setSelectedUser] = useState<SettingUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('rep');
  const [editProducts, setEditProducts] = useState<ProductId[]>([]);
  const [editTier, setEditTier] = useState<CommissionTier>('junior');
  const [editIsActive, setEditIsActive] = useState(true);

  // Estados locais para Perfis (Roles)
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleNameInput, setRoleNameInput] = useState('');
  const [roleIdInput, setRoleIdInput] = useState('');
  const [rolePermsSelected, setRolePermsSelected] = useState<string[]>([]);
  const [isEditingRole, setIsEditingRole] = useState(false);

  const PERMISSIONS_METADATA = [
    { category: 'Navegação e Acesso a Páginas', items: [
      { id: 'view_dashboard', label: 'Ver Dashboard Geral', desc: 'Acesso à página principal' },
      { id: 'view_pipeline', label: 'Ver Pipeline Kanban', desc: 'Acesso ao funil de vendas' },
      { id: 'view_contacts', label: 'Ver Contatos', desc: 'Acesso à lista e cadastro de contatos' },
      { id: 'view_companies', label: 'Ver Empresas', desc: 'Acesso à lista de empresas' },
      { id: 'view_cadence', label: 'Ver Cadência SDR', desc: 'Acesso ao motor de cadência diária' },
      { id: 'view_activities', label: 'Ver Histórico de Atividades', desc: 'Acesso ao log geral de interações' },
      { id: 'view_handoffs', label: 'Ver Handoffs (Bastão)', desc: 'Acesso ao fluxo de passagem de bastão' },
      { id: 'view_tasks', label: 'Ver Painel de Tarefas', desc: 'Acesso às tarefas manuais e playbooks' },
      { id: 'view_leaderboard', label: 'Ver Leaderboard', desc: 'Acesso à gamificação e medalhas' },
      { id: 'view_carteira', label: 'Ver Carteira', desc: 'Visualizar saldo de moedas do assessor' },
      { id: 'view_loja', label: 'Ver Loja de Prêmios', desc: 'Resgate de prêmios e produtos' },
      { id: 'view_kpi_reports', label: 'Ver KPIs & Relatórios', desc: 'Visão de conversões e mapa geográfico' },
      { id: 'view_admin_settings', label: 'Ver Configurações Gerais', desc: 'Acesso a esta página de administração' },
    ]},
    { category: 'Painel do Dashboard (Visão do Home)', items: [
      { id: 'view_management_dashboard', label: 'Painel de Gestão (Manager)', desc: 'Visualiza KPIs globais e atividades de todo o time' },
      { id: 'view_sdr_dashboard', label: 'Painel de SDR', desc: 'Visualiza funil de cadência e fila diária' },
      { id: 'view_rep_dashboard', label: 'Painel de Representante (Rep)', desc: 'Visualiza handoffs aceitos e vencimentos' },
      { id: 'view_bdr_dashboard', label: 'Painel de BDR', desc: 'Visualiza leads gerados e status da fila' },
      { id: 'view_viewer_dashboard', label: 'Painel de Visualizador (Viewer)', desc: 'Visualiza dados consolidados apenas para leitura' },
    ]}
  ];

  const handleCreateRoleClick = () => {
    setRoleNameInput('');
    setRoleIdInput('');
    setRolePermsSelected([]);
    setIsEditingRole(false);
    setShowRoleModal(true);
  };

  const handleEditRoleClick = (r: any) => {
    setRoleNameInput(r.name);
    setRoleIdInput(r.id);
    setRolePermsSelected(r.permissions || []);
    setIsEditingRole(true);
    setShowRoleModal(true);
  };

  const handleRoleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleNameInput.trim() || !roleIdInput.trim()) return;
    const docId = roleIdInput.trim().toLowerCase().replace(/\s+/g, '_');
    
    await saveRole(docId, {
      id: docId,
      name: roleNameInput.trim(),
      permissions: rolePermsSelected,
    });
    
    setShowRoleModal(false);
  };

  const handleDeleteRoleClick = async (roleId: string) => {
    if (['master', 'manager', 'sdr', 'rep', 'bdr', 'viewer'].includes(roleId)) {
      alert('Não é possível excluir um perfil padrão do sistema.');
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir o perfil "${getRoleLabel(roleId)}"? Esta ação pode impactar usuários associados.`)) return;
    await deleteRole(roleId);
  };

  const handleTogglePermission = (permId: string) => {
    if (rolePermsSelected.includes(permId)) {
      setRolePermsSelected(rolePermsSelected.filter(id => id !== permId));
    } else {
      setRolePermsSelected([...rolePermsSelected, permId]);
    }
  };

  const handleOpenUserActions = (u: SettingUser) => {
    setSelectedUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditProducts(u.productIds || []);
    setEditTier(u.commissionTier || 'junior');
    setEditIsActive(u.isActive !== false);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;

    const COLORS = ['#1A6B1A', '#8DB600', '#7C3AED', '#B45309', '#B91C1C', '#0E7490', '#4B5563'];
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];

    const getInitials = (name: string) => {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.trim().substring(0, 2).toUpperCase();
    };

    await addUser({
      name: inviteName.trim(),
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      productIds: inviteProducts,
      commissionTier: inviteRole === 'sdr' ? inviteTier : undefined,
      initials: getInitials(inviteName),
      color: randomColor,
      last: 'Convidado (Sem Acesso)',
      isActive: true,
    });

    setInviteName('');
    setInviteEmail('');
    setInviteRole('rep');
    setInviteProducts(['wizmart']);
    setShowInviteModal(false);
  };

  const handleUserEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser?.id || !editName.trim()) return;

    await updateUser(selectedUser.id, {
      name: editName.trim(),
      role: editRole,
      productIds: editProducts,
      commissionTier: editRole === 'sdr' ? editTier : null,
      isActive: editIsActive,
    });

    setSelectedUser(null);
  };

  const handleDeleteUserClick = async () => {
    if (!selectedUser?.id) return;
    if (!confirm(`Tem certeza de que deseja remover permanentemente o usuário ${selectedUser.name}? Esta ação não pode ser desfeita.`)) return;

    await deleteUser(selectedUser.id);
    setSelectedUser(null);
  };

  // Estados locais
  const [apiKey, setApiKey] = useState('mskt_9f2k7d1a4n0m8p');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  // Progresso visual local enquanto a importação assíncrona não publica status real.
  const runLocalImportSimulation = () => {
    setIsImporting(true);
    setImportProgress(0);
    
    const interval = setInterval(() => {
      setImportProgress(prev => {
        const next = prev + Math.floor(Math.random() * 2000) + 1500;
        if (next >= 30000) {
          clearInterval(interval);
          setIsImporting(false);
          return 30000;
        }
        return next;
      });
    }, 1500);
  };

  const handleStartImport = async () => {
    // 1. Simula no banco gravando o documento settings/moskit_import (Fase 6)
    try {
      // Cria/Atualiza o documento
      if (moskitDoc) {
        await updateDocument('moskit_import', {
          status: 'processing',
          progress: 0,
          totalEstimado: 30000,
          apiKeyMasked: apiKey.substring(0, 5) + '••••••••••••'
        });
      } else {
        // addDocument cria um ID aleatório, então usamos um set direto se possível,
        // ou simulamos via estado local se o CRUD falhar.
        // Como o hook addDocument gera id automático, salvamos local e tentamos criar
        await addDocument({
          id: 'moskit_import',
          status: 'processing',
          progress: 0,
          totalEstimado: 30000,
          apiKeyMasked: apiKey.substring(0, 5) + '••••••••••••'
        });
      }
    } catch (err) {
      console.warn("CRUD Firestore de configurações restrito. Iniciando progresso visual local:", err);
    }
    
    // Dispara simulação visual local para a interface rodar fluida
    runLocalImportSimulation();
  };

  // 1. Pane Empresa
  const renderEmpresa = () => (
    <div className="card card-pad" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="field" style={{ margin: 0 }}>
        <div className="fl">Nome da Empresa</div>
        <input className="input" defaultValue="WizMart Distribuição de Bebidas Ltda" aria-label="Nome da Empresa" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <div className="fl">CNPJ</div>
        <input className="input" defaultValue="42.118.330/0001-09" aria-label="CNPJ" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <div className="fl">Fuso Horário (Regra Brasília GMT-3)</div>
        <div style={{ position: 'relative' }}>
          <input className="input" defaultValue="(GMT-03:00) Brasília Time (Locked)" disabled style={{ background: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-secondary)', fontWeight: 600 }} aria-label="Fuso Horário (Bloqueado)" />
          <span style={{ position: 'absolute', right: 12, top: 11, color: 'var(--primary)' }}>
            <Icon name="Lock" size={14} />
          </span>
        </div>
      </div>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Salvar Alterações
      </button>
    </div>
  );

  // 2. Pane Usuários
  const renderUsuarios = () => (
    <div className="card">
      <div className="card-hd" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14.5 }}>Usuários Ativos</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowInviteModal(true)}>
          <Icon name="UserPlus" size={15} />
          Convidar Vendedor
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              {['Usuário', 'Email', 'Cargo / Papel', 'Produtos', 'Último Acesso', ''].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingUsers ? (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: 'center' }} className="muted">Carregando usuários...</td>
              </tr>
            ) : (
              users.map((u, i) => (
                <tr key={i} className={i % 2 ? 'alt' : ''}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <Av initials={u.initials} color={u.color} size={28} />
                      <span style={{ fontWeight: 600, opacity: u.isActive === false ? 0.5 : 1 }}>
                        {u.name}
                        {u.isActive === false && (
                          <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: 10, padding: '1px 4px' }}>bloqueado</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <span className={`badge ${getRoleBadgeClass(u.role)}`}>{getRoleLabel(u.role)}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(u.productIds || []).map(p => (
                        <span key={p} className="badge badge-gray" style={{ fontSize: 10, padding: '1px 5px', textTransform: 'capitalize' }}>
                          {p === 'smart_cafe' ? 'Smart Café' : 'WizMart'}
                        </span>
                      ))}
                      {(u.productIds || []).length === 0 && <span className="muted" style={{ fontSize: 11 }}>Nenhum</span>}
                    </div>
                  </td>
                  <td className="muted">{u.last}</td>
                  <td>
                    <button 
                      className="icon-btn" 
                      style={{ width: 30, height: 30 }} 
                      aria-label="Mais opções para este usuário"
                      onClick={() => handleOpenUserActions(u)}
                    >
                      <Icon name="MoreHorizontal" size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // 3. Pane Pipelines (Drag simulator style)
  const renderPipelines = () => <PipelinesPane />;

  // 3.5 — Pane Google Calendar
  const renderCalendar = () => <CalendarPane />;

  // 4. Pane Integrações (Moskit progress)
  const renderIntegracoes = () => {
    // Mescla status do banco com estado local da simulação
    const status = isImporting ? 'processing' : (moskitDoc?.status || 'idle');
    const progress = isImporting ? importProgress : (moskitDoc?.progress || 0);
    const total = moskitDoc?.totalEstimado || 30000;
    const pct = Math.round((progress / total) * 100);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        
        {/* Moskit CRM Card */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Database" size={22} color="var(--primary)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>Moskit CRM</div>
              <div className="muted" style={{ fontSize: 12 }}>Importação unidirecional e backup histórico</div>
            </div>
            <span className={`badge ${status === 'completed' ? 'badge-primary' : status === 'processing' ? 'badge-accent' : 'badge-gray'}`}>
              {status === 'completed' ? 'Sincronizado' : status === 'processing' ? 'Sincronizando' : 'Disponível'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">API Key do Moskit</div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ paddingRight: 36 }}
                  disabled={status === 'processing'}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'none', color: '#9aa3af', cursor: 'pointer' }}
                >
                  <Icon name={showApiKey ? 'EyeOff' : 'Eye'} size={16} />
                </button>
              </div>
            </div>

            {status === 'processing' ? (
              /* Loader de progresso do GCP Cloud Tasks */
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-hover)' }} className="row">
                    <span className="live-indicator" style={{ color: 'var(--primary)', marginRight: 5 }}>⬤</span>
                    Importando registros do Moskit...
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>
                    {pct}% ({progress.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')})
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--brand-wiz))', borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
                  💡 GCP Cloud Tasks enfileirando 600 requisições atrasadas para proteger os limites de API do Moskit.
                </div>
              </div>
            ) : status === 'completed' ? (
              /* Conclusão */
              <div style={{ background: 'var(--primary-light)', padding: 10, borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--primary-hover)', fontWeight: 600 }}>
                <Icon name="CheckCircle2" size={16} color="var(--primary)" />
                <span>Backup concluído! 30.000 documentos importados com sucesso em 29/05/2026.</span>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onClick={handleStartImport}
              >
                <Icon name="Download" size={15} />
                Iniciar Importação de Histórico (3 anos)
              </button>
            )}

            <div style={{ background: '#fdfcfe', border: '1px dashed #e9d5ff', borderRadius: 8, padding: 10, fontSize: 12, color: '#6b21a8', display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 4 }}>
              <Icon name="Info" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Dimensões do Backup:</strong> Fila assíncrona tolerante a rate limits (HTTP 429) estruturada para carregar 3 anos de logs de 25 assessores.
              </div>
            </div>
          </div>
        </div>

        {/* Outras conexões placeholder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { icon: 'Calendar', title: 'Google Agenda', desc: 'Sync de convites e reuniões em tempo real' },
            { icon: 'MessageCircle', title: 'WhatsApp Business', desc: 'Rastreio de interações e contatos ativos' },
            { icon: 'Mail', title: 'SMTP Email Corporativo', desc: 'Disparo de emails e propostas direto do Kanban' }
          ].map((item, i) => (
            <div key={i} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} size={18} color="var(--text-secondary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{item.title}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{item.desc}</div>
              </div>
              <span className="badge badge-gray" style={{ fontSize: 9.5 }}>Desconectado</span>
            </div>
          ))}
        </div>

      </div>
    );
  };

  // 5. Pane Plano
  const renderPlano = () => (
    <div className="card card-pad" style={{ maxWidth: 520 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h2 className="h2">Plano WizMart Professional</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Faturamento anual recorrente (25 licenças de vendedor)</div>
        </div>
        <span className="badge badge-primary">Ativo</span>
      </div>
      <div className="money" style={{ fontSize: 26, color: 'var(--primary)', fontWeight: 800 }}>
        R$ 2.388<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}> / ano</span>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="Check" size={14} color="var(--primary)" />
          <span>Usuários ILIMITADOS para TV Display pública</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="Check" size={14} color="var(--primary)" />
          <span>Fila de GCP Cloud Tasks para importação resiliente de grandes bases</span>
        </div>
      </div>
      <button className="btn btn-outline btn-sm" style={{ marginTop: 18 }}>
        Gerenciar Assinatura
      </button>
    </div>
  );

  // 2.5. Pane Perfis
  const renderPerfis = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-hd" style={{ justifyContent: 'space-between', padding: 0 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Perfis Comerciais &amp; Acessos</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Crie perfis e defina regras de acesso granulares para cada papel no sistema.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleCreateRoleClick}>
          <Icon name="Plus" size={15} />
          Criar Novo Perfil
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {mergedRoles.map(r => {
          const isDefault = ['master', 'manager', 'sdr', 'rep', 'bdr', 'viewer'].includes(r.id);
          const activeCount = (r.permissions || []).length;
          
          return (
            <div key={r.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{r.name}</h4>
                    <span className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>@{r.id}</span>
                  </div>
                  <span className={`badge ${isDefault ? 'badge-primary' : 'badge-accent'}`} style={{ fontSize: 9.5 }}>
                    {isDefault ? 'Padrão' : 'Customizado'}
                  </span>
                </div>
                
                <div style={{ marginTop: 12, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="muted">Permissões Ativas</span>
                    <strong style={{ color: 'var(--primary-hover)' }}>{activeCount} de 18</strong>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(activeCount / 18) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                {r.id === 'master' ? (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontStyle: 'italic' }}>
                    <Icon name="Lock" size={12} />
                    Superusuário (Bloqueado para edição)
                  </span>
                ) : (
                  <>
                    <button className="btn btn-sm btn-outline" style={{ flex: 1, padding: '4px 8px', fontSize: 11.5 }} onClick={() => handleEditRoleClick(r)}>
                      <Icon name="Edit" size={13} />
                      Editar Permissões
                    </button>
                    {!isDefault && (
                      <button type="button" className="icon-btn btn-danger" style={{ width: 28, height: 28, borderRadius: 6, color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleDeleteRoleClick(r.id)} title="Excluir Perfil">
                        <Icon name="Trash2" size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const subPanes: Record<string, () => React.ReactNode> = {
    empresa:     renderEmpresa,
    usuarios:    renderUsuarios,
    perfis:      renderPerfis,
    pipelines:   renderPipelines,
    calendar:    renderCalendar,
    integracoes: renderIntegracoes,
    plano:       renderPlano,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      
      {/* Restrição de Perfil Admin */}
      <div style={{ background: 'var(--primary-light)', borderLeft: '4px solid var(--primary)', borderRadius: '0 8px 8px 0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="ShieldAlert" size={18} color="var(--primary)" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--primary-hover)' }}>
          Acesso restrito — Preferências Administrativas do Master
        </span>
      </div>

      <h1 className="h1">Configurações Gerais</h1>

      {/* Seletor de Abas */}
      <div className="tabs">
        {[
          ['empresa',     'Minha Empresa'],
          ['usuarios',    'Equipe & Usuários'],
          ['perfis',      '🏆 Perfis & Permissões'],
          ['pipelines',   'Pipelines'],
          ['calendar',    '📅 Google Calendar'],
          ['integracoes', 'Integrações'],
          ['plano',       'Assinatura & Plano'],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`tab ${tab === k ? 'active' : ''}`}
            onClick={() => setTab(k as any)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Corpo da Aba Selecionada */}
      {subPanes[tab]()}

      {/* Modal Convidar Vendedor */}
      {showInviteModal && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Convidar Novo Vendedor</h3>
              <button className="icon-btn" onClick={() => setShowInviteModal(false)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleInviteSubmit}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome Completo *</div>
                  <input className="input" required value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Ex: Lucas Silva" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">E-mail *</div>
                  <input className="input" type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Ex: lucas@empresa.com.br" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Cargo / Papel *</div>
                  <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                    {mergedRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                {inviteRole === 'sdr' && (
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Nível de Comissão (SDR)</div>
                    <select className="input" value={inviteTier} onChange={e => setInviteTier(e.target.value as CommissionTier)}>
                      <option value="junior">Junior — 7,5%</option>
                      <option value="pleno">Pleno — 8,75%</option>
                      <option value="senior">Senior — 10%</option>
                    </select>
                  </div>
                )}
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Produtos Autorizados</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5 }}>
                      <input 
                        type="checkbox" 
                        checked={inviteProducts.includes('wizmart')} 
                        onChange={e => {
                          if (e.target.checked) {
                            setInviteProducts([...inviteProducts, 'wizmart']);
                          } else {
                            setInviteProducts(inviteProducts.filter(p => p !== 'wizmart'));
                          }
                        }} 
                      />
                      WizMart
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5 }}>
                      <input 
                        type="checkbox" 
                        checked={inviteProducts.includes('smart_cafe')} 
                        onChange={e => {
                          if (e.target.checked) {
                            setInviteProducts([...inviteProducts, 'smart_cafe']);
                          } else {
                            setInviteProducts(inviteProducts.filter(p => p !== 'smart_cafe'));
                          }
                        }} 
                      />
                      Smart Café
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Icon name="Check" size={16} />Enviar Convite</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Usuário */}
      {selectedUser && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setSelectedUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Gerenciar Usuário: {selectedUser.name}</h3>
              <button className="icon-btn" onClick={() => setSelectedUser(null)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleUserEditSubmit}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome Completo</div>
                  <input className="input" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Cargo / Papel</div>
                  <select className="input" value={editRole} onChange={e => setEditRole(e.target.value as any)}>
                    {mergedRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                {editRole === 'sdr' && (
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Nível de Comissão (SDR)</div>
                    <select className="input" value={editTier} onChange={e => setEditTier(e.target.value as CommissionTier)}>
                      <option value="junior">Junior — 7,5%</option>
                      <option value="pleno">Pleno — 8,75%</option>
                      <option value="senior">Senior — 10%</option>
                    </select>
                  </div>
                )}
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Produtos Autorizados</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5 }}>
                      <input 
                        type="checkbox" 
                        checked={editProducts.includes('wizmart')} 
                        onChange={e => {
                          if (e.target.checked) {
                            setEditProducts([...editProducts, 'wizmart']);
                          } else {
                            setEditProducts(editProducts.filter(p => p !== 'wizmart'));
                          }
                        }} 
                      />
                      WizMart
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5 }}>
                      <input 
                        type="checkbox" 
                        checked={editProducts.includes('smart_cafe')} 
                        onChange={e => {
                          if (e.target.checked) {
                            setEditProducts([...editProducts, 'smart_cafe']);
                          } else {
                            setEditProducts(editProducts.filter(p => p !== 'smart_cafe'));
                          }
                        }} 
                      />
                      Smart Café
                    </label>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Status da Conta</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>Bloquear impede o acesso do vendedor ao sistema</div>
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${editIsActive ? 'btn-outline' : 'btn-danger'}`}
                      onClick={() => setEditIsActive(!editIsActive)}
                    >
                      {editIsActive ? 'Bloquear Acesso' : 'Desbloquear Acesso'}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--danger)' }}>Excluir Usuário</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>Remove permanentemente o usuário da base</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={handleDeleteUserClick}
                    >
                      Excluir Conta
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedUser(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Icon name="Save" size={16} />Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Criar/Editar Perfil */}
      {showRoleModal && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowRoleModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>{isEditingRole ? `Editar Perfil: ${roleNameInput}` : 'Criar Novo Perfil'}</h3>
              <button className="icon-btn" onClick={() => setShowRoleModal(false)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleRoleSaveSubmit}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Nome do Perfil *</div>
                    <input 
                      className="input" 
                      required 
                      value={roleNameInput} 
                      onChange={e => {
                        setRoleNameInput(e.target.value);
                        if (!isEditingRole) {
                          setRoleIdInput(e.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                        }
                      }} 
                      placeholder="Ex: Comercial Avançado" 
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">ID do Perfil / Slug *</div>
                    <input 
                      className="input" 
                      required 
                      disabled={isEditingRole}
                      value={roleIdInput} 
                      onChange={e => setRoleIdInput(e.target.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))} 
                      placeholder="Ex: comercial_avancado" 
                      style={isEditingRole ? { background: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-secondary)' } : {}}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>Definição de Permissões</h4>
                  
                  {PERMISSIONS_METADATA.map(cat => (
                    <div key={cat.category} style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        {cat.category}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {cat.items.map(p => {
                          const isChecked = rolePermsSelected.includes(p.id);
                          return (
                            <label 
                              key={p.id} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'flex-start', 
                                gap: 8, 
                                padding: 8, 
                                border: '1px solid var(--border)', 
                                borderRadius: 6, 
                                cursor: 'pointer',
                                background: isChecked ? 'var(--primary-light)' : 'var(--card-bg)',
                                transition: 'all 0.15s'
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={() => handleTogglePermission(p.id)} 
                                style={{ marginTop: 3 }}
                              />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{p.label}</div>
                                <div className="muted" style={{ fontSize: 10, marginTop: 1 }}>{p.desc}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setShowRoleModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  <Icon name="Save" size={16} />
                  Salvar Perfil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default SettingsPage;
