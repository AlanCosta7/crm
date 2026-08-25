/**
 * LeadSourcesPane.tsx — Aba "Captação de Leads" (WizMart Forms) nas Configurações.
 *
 * Autoatendimento do master/manager: criar fonte (a chave é exibida UMA única
 * vez — só o hash SHA-256 é armazenado), editar domínios permitidos, funil e
 * responsável, ativar/desativar (kill-switch imediato), rotacionar chave e
 * acompanhar contadores de recebidos/bloqueados. Nenhuma alteração aqui
 * depende de deploy — a Cloud Function lê a fonte a cada requisição.
 */

import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Funnel, LeadSource, SettingUser } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import {
  generateLeadSourceKey,
  LEADS_ENDPOINT,
  parseOriginsInput,
} from './leadSourceKey';

function fmtWhen(ts: any): string {
  if (!ts) return '—';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function LeadSourcesPane() {
  const { user } = useAuthStore();
  const { data: sources, loading } = useFirestoreCollection<LeadSource>('lead_sources');
  const { data: funnels } = useFirestoreCollection<Funnel>('funnels');
  const { data: users } = useFirestoreCollection<SettingUser>('users');
  const { addDocument, updateDocument, deleteDocument } = useFirestoreMutations('lead_sources');

  const isMaster = user?.role === 'master';
  const activeFunnels = funnels.filter(f => f.isActive !== false);

  // ── Formulário (criar/editar) ────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeadSource | null>(null);
  const [fName, setFName] = useState('');
  const [fOrigins, setFOrigins] = useState('');
  const [fFunnelId, setFFunnelId] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [fTurnstile, setFTurnstile] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // ── Chave revelada (pós-criação/rotação) ─────────────────────────────────
  const [revealedKey, setRevealedKey] = useState<{ key: string; sourceName: string } | null>(null);
  const [copied, setCopied] = useState<'key' | 'endpoint' | null>(null);
  const [rotateTarget, setRotateTarget] = useState<LeadSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadSource | null>(null);

  const copyText = async (text: string, which: 'key' | 'endpoint') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard indisponível — usuário copia manualmente */
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFName(''); setFOrigins(''); setFFunnelId(activeFunnels[0]?.id ?? '');
    setFOwner(''); setFTurnstile(false); setFormError('');
    setShowForm(true);
  };

  const openEdit = (s: LeadSource) => {
    setEditing(s);
    setFName(s.name);
    setFOrigins((s.allowedOrigins ?? []).join('\n'));
    setFFunnelId(s.funnelId);
    setFOwner(s.defaultOwner ?? '');
    setFTurnstile(!!s.turnstileEnabled);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const origins = parseOriginsInput(fOrigins);
    const funnel = funnels.find(f => f.id === fFunnelId);
    if (!fName.trim() || origins.length === 0 || !funnel) {
      setFormError('Preencha o nome, ao menos um domínio e o funil de destino.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const fields = {
        name: fName.trim(),
        allowedOrigins: origins,
        funnelId: funnel.id,
        productId: funnel.productId,
        defaultOwner: fOwner || '',
        turnstileEnabled: fTurnstile,
      };
      if (editing) {
        await updateDocument(editing.id, fields);
      } else {
        const generated = await generateLeadSourceKey();
        await addDocument({
          ...fields,
          apiKeyHash: generated.hash,
          apiKeyPrefix: generated.prefix,
          isActive: true,
          stats: { received: 0, blocked: 0 },
        });
        setRevealedKey({ key: generated.key, sourceName: fields.name });
      }
      setShowForm(false);
    } catch (err) {
      console.error('[LeadSourcesPane] Erro ao salvar fonte:', err);
      setFormError('Erro ao salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (s: LeadSource) => {
    try {
      await updateDocument(s.id, { isActive: !s.isActive });
    } catch (err) {
      console.error('[LeadSourcesPane] Erro no kill-switch:', err);
    }
  };

  const handleRotate = async () => {
    if (!rotateTarget) return;
    setBusy(true);
    try {
      const generated = await generateLeadSourceKey();
      await updateDocument(rotateTarget.id, {
        apiKeyHash: generated.hash,
        apiKeyPrefix: generated.prefix,
      });
      setRevealedKey({ key: generated.key, sourceName: rotateTarget.name });
      setRotateTarget(null);
    } catch (err) {
      console.error('[LeadSourcesPane] Erro ao rotacionar chave:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error('[LeadSourcesPane] Erro ao excluir fonte:', err);
    } finally {
      setBusy(false);
    }
  };

  const funnelName = (id: string) => funnels.find(f => f.id === id)?.name ?? id;
  const ownerName = (uid?: string) =>
    uid ? (users.find(u => u.id === uid)?.name ?? uid) : 'Fila (managers)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Endpoint p/ integração */}
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Icon name="Globe" size={20} color="var(--primary)" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Endpoint de captação</div>
          <code style={{ fontSize: 12, color: 'var(--text-2)' }}>{LEADS_ENDPOINT}</code>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => copyText(LEADS_ENDPOINT, 'endpoint')}>
          <Icon name={copied === 'endpoint' ? 'Check' : 'Copy'} size={13} />
          {copied === 'endpoint' ? 'Copiado!' : 'Copiar URL'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Icon name="Plus" size={14} /> Nova Fonte
        </button>
      </div>

      {/* Tabela de fontes */}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Domínios permitidos</th>
              <th>Funil de destino</th>
              <th>Responsável</th>
              <th style={{ textAlign: 'center' }}>Recebidos</th>
              <th style={{ textAlign: 'center' }}>Bloqueados</th>
              <th>Último lead</th>
              <th style={{ textAlign: 'center' }}>Ativa</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 28, color: 'var(--text-2)' }}>
                  {loading ? 'Carregando…' : 'Nenhuma fonte cadastrada. Clique em "Nova Fonte" para integrar um site ou landing page.'}
                </td>
              </tr>
            )}
            {sources.map(s => (
              <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.55 }}>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  <code style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.apiKeyPrefix}</code>
                </td>
                <td style={{ fontSize: 12, maxWidth: 200 }}>
                  {(s.allowedOrigins ?? []).map(o => (
                    <div key={o} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</div>
                  ))}
                </td>
                <td style={{ fontSize: 12.5 }}>{funnelName(s.funnelId)}</td>
                <td style={{ fontSize: 12.5 }}>{ownerName(s.defaultOwner)}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{s.stats?.received ?? 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#B91C1C' }}>{s.stats?.blocked ?? 0}</td>
                <td style={{ fontSize: 12 }}>{fmtWhen(s.stats?.lastLeadAt)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className="icon-btn"
                    title={s.isActive ? 'Desativar fonte (kill-switch imediato)' : 'Reativar fonte'}
                    aria-label={s.isActive ? `Desativar fonte ${s.name}` : `Reativar fonte ${s.name}`}
                    onClick={() => handleToggleActive(s)}
                  >
                    <Icon name={s.isActive ? 'ToggleRight' : 'ToggleLeft'} size={22} color={s.isActive ? 'var(--primary)' : '#9aa3af'} />
                  </button>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="icon-btn" title="Editar fonte" aria-label={`Editar fonte ${s.name}`} onClick={() => openEdit(s)}>
                    <Icon name="Pencil" size={15} />
                  </button>
                  <button className="icon-btn" title="Rotacionar chave" aria-label={`Rotacionar chave de ${s.name}`} onClick={() => setRotateTarget(s)}>
                    <Icon name="RefreshCw" size={15} />
                  </button>
                  {isMaster && (
                    <button className="icon-btn" title="Excluir fonte" aria-label={`Excluir fonte ${s.name}`} onClick={() => setDeleteTarget(s)}>
                      <Icon name="Trash2" size={15} color="#B91C1C" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal criar/editar fonte */}
      {showForm && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>{editing ? `Editar Fonte — ${editing.name}` : 'Nova Fonte de Captação'}</h3>
              <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Fechar"><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome da fonte *</div>
                  <input className="input" required value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: Landing Page Smart Café" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Domínios permitidos * (um por linha)</div>
                  <textarea
                    className="input"
                    rows={3}
                    required
                    value={fOrigins}
                    onChange={e => setFOrigins(e.target.value)}
                    placeholder={'https://wizmart.com.br\nhttps://*.wizmart.com.br'}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5 }}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
                    Pode colar a URL completa de uma página (ex.: <code>https://site.com/landing</code>) — só o domínio é considerado. Use <code>*.dominio.com.br</code> para aceitar qualquer subdomínio. Leads enviados de outros domínios são recusados.
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Funil de destino *</div>
                  <select className="input" required value={fFunnelId} onChange={e => setFFunnelId(e.target.value)}>
                    <option value="" disabled>Selecione…</option>
                    {activeFunnels.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
                    O lead entra como card no primeiro estágio deste funil.
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Responsável pelos leads (opcional)</div>
                  <select className="input" value={fOwner} onChange={e => setFOwner(e.target.value)}>
                    <option value="">Sem responsável fixo — notifica os gestores</option>
                    {users.filter(u => u.isActive !== false).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={fTurnstile} onChange={e => setFTurnstile(e.target.checked)} />
                  Exigir verificação anti-robô Cloudflare Turnstile
                </label>
                {formError && (
                  <div style={{ color: '#B91C1C', fontSize: 12.5, fontWeight: 600 }}>{formError}</div>
                )}
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar fonte e gerar chave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal chave revelada (UMA única vez) */}
      {revealedKey && (
        <div className="modal-ov" style={{ zIndex: 320 }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>🔑 Chave da fonte "{revealedKey.sourceName}"</h3>
            </div>
            <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#FEF3C7', borderLeft: '4px solid #F59E0B', borderRadius: '0 8px 8px 0', padding: '10px 14px', fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>
                Esta chave é exibida somente AGORA. Guarde-a em local seguro — por segurança, o sistema não armazena a chave, apenas uma impressão digital dela. Se perder, rotacione a chave.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code
                  data-testid="revealed-key"
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, wordBreak: 'break-all' }}
                >
                  {revealedKey.key}
                </code>
                <button className="btn btn-primary btn-sm" onClick={() => copyText(revealedKey.key, 'key')}>
                  <Icon name={copied === 'key' ? 'Check' : 'Copy'} size={13} />
                  {copied === 'key' ? 'Copiada!' : 'Copiar'}
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                Cole esta chave no atributo <code>data-wizmart-key</code> do formulário do site (ou no header <code>X-WizMart-Key</code> em integrações diretas).
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-primary btn-sm" onClick={() => setRevealedKey(null)}>
                Já guardei a chave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de rotação */}
      {rotateTarget && (
        <div className="modal-ov" style={{ zIndex: 310 }} onClick={() => setRotateTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><h3 style={{ fontSize: 15 }}>Rotacionar chave de "{rotateTarget.name}"?</h3></div>
            <div className="modal-bd" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              A chave atual ({rotateTarget.apiKeyPrefix}) deixa de funcionar <b>imediatamente</b>. Os sites que usam esta fonte precisarão ser atualizados com a nova chave.
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline btn-sm" onClick={() => setRotateTarget(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={handleRotate}>
                {busy ? 'Gerando…' : 'Rotacionar agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão (master) */}
      {deleteTarget && (
        <div className="modal-ov" style={{ zIndex: 310 }} onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><h3 style={{ fontSize: 15 }}>Excluir fonte "{deleteTarget.name}"?</h3></div>
            <div className="modal-bd" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              A captação por esta fonte para <b>imediatamente</b> e a configuração é removida. Os leads e deals já recebidos são preservados. Se a intenção é pausar temporariamente, use o botão de desativar.
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleDelete}>
                {busy ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
