/**
 * TemplatesConfigPage.tsx — Administração de Templates de Mensagem (admin)
 *
 * Rota: /settings/templates (master + manager)
 *
 * Achado crítico (PLANO_DESENHO_CRM.md, 13/09/2026): a coleção `templates`
 * (PlaybookTemplate) é lida por EmailActionModal e WhatsAppActionModal no
 * card, mas não existia NENHUMA tela para criar/editar — só dava pra corrigir
 * mexendo direto no Firestore. Os 3 templates de exemplo usavam nomes de
 * variável (`{{companyName}}`) que não batiam com o `ctx` real (`{{empresa}}`),
 * e ninguém tinha como notar isso pela UI.
 *
 * Esta tela expõe o catálogo de variáveis de merge (templateVariables.ts) e
 * mostra um preview ao vivo com dados de exemplo, avisando quando o template
 * usa uma variável que não existe no contexto real — exatamente o bug acima.
 */

import { useMemo, useState } from 'react';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { PlaybookTemplate, FunnelType, ProductId } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { ACTIVITY_TYPE_CONFIG } from '../../utils/cadenceUtils';
import { renderTemplate, extractVariables } from '../../utils/templateRender';
import { PRODUCT_LABEL } from '../../utils/crmFormat';
import { TEMPLATE_VARIABLES, TEMPLATE_SAMPLE_CONTEXT, unknownTemplateVariables } from './templateVariables';

// Só email e whatsapp são de fato consumidos hoje (EmailActionModal/WhatsAppActionModal).
type TemplateChannel = 'email' | 'whatsapp';
const CHANNELS: TemplateChannel[] = ['email', 'whatsapp'];

type TemplateRole = 'sdr' | 'rep' | 'all';
const ROLE_LABEL: Record<TemplateRole, string> = { sdr: 'SDR', rep: 'Representante', all: 'Todos' };

type TemplateFunnelType = FunnelType | 'all';
const FUNNEL_TYPE_LABEL: Record<TemplateFunnelType, string> = {
  all: 'Todos os funis', inbound: 'Inbound', outbound: 'Outbound', hunter: 'Hunter', main: 'Principal',
};

function emptyForm() {
  return {
    name: '',
    activityType: 'email' as TemplateChannel,
    role: 'all' as TemplateRole,
    funnelType: 'all' as TemplateFunnelType,
    productId: '' as ProductId | '',
    subject: '',
    body: '',
  };
}

export default function TemplatesConfigPage() {
  const { data: templates, loading } = useFirestoreCollection<PlaybookTemplate>('templates');
  const { addDocument, updateDocument, deleteDocument } = useFirestoreMutations('templates');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlaybookTemplate | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlaybookTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (t: PlaybookTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      activityType: (t.activityType === 'whatsapp' ? 'whatsapp' : 'email'),
      role: (t.role as TemplateRole) ?? 'all',
      funnelType: (t.funnelType as TemplateFunnelType) ?? 'all',
      productId: t.productId ?? '',
      subject: t.subject ?? '',
      body: t.body,
    });
    setFormError('');
    setShowForm(true);
  };

  const unknownVars = useMemo(
    () => unknownTemplateVariables(`${form.subject}\n${form.body}`),
    [form.subject, form.body],
  );

  const previewSubject = useMemo(() => renderTemplate(form.subject, TEMPLATE_SAMPLE_CONTEXT), [form.subject]);
  const previewBody = useMemo(() => renderTemplate(form.body, TEMPLATE_SAMPLE_CONTEXT), [form.body]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Informe o nome do template.'); return; }
    if (!form.body.trim()) { setFormError('Escreva o corpo da mensagem.'); return; }
    if (form.activityType === 'email' && !form.subject.trim()) { setFormError('Templates de email precisam de assunto.'); return; }

    setBusy(true);
    setFormError('');
    try {
      const variables = extractVariables(`${form.subject}\n${form.body}`);
      const fields: Partial<PlaybookTemplate> = {
        name: form.name.trim(),
        activityType: form.activityType,
        role: form.role,
        funnelType: form.funnelType,
        productId: form.productId || undefined,
        subject: form.activityType === 'email' ? form.subject.trim() : undefined,
        body: form.body,
        variables,
      };
      if (editing) {
        await updateDocument(editing.id!, fields);
      } else {
        await addDocument({ ...fields, isActive: true, usageCount: 0 });
      }
      setShowForm(false);
    } catch (err) {
      console.error('[TemplatesConfigPage] Erro ao salvar template:', err);
      setFormError('Erro ao salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (t: PlaybookTemplate) => {
    try {
      await updateDocument(t.id!, { isActive: !t.isActive });
    } catch (err) {
      console.error('[TemplatesConfigPage] Erro ao ativar/desativar:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id!);
      setDeleteTarget(null);
    } catch (err) {
      console.error('[TemplatesConfigPage] Erro ao excluir template:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h1">Templates de Mensagem</h1>
          <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
            Templates usados nos modais de Email e WhatsApp do card. Use <code>{'{{variavel}}'}</code> para
            inserir dados do negócio — veja a lista de variáveis disponíveis ao criar ou editar.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Icon name="Plus" size={14} /> Novo Template
        </button>
      </div>

      {/* Tabela de templates */}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Canal</th>
              <th>Papel</th>
              <th>Funil</th>
              <th>Produto</th>
              <th style={{ textAlign: 'center' }}>Uso</th>
              <th style={{ textAlign: 'center' }}>Ativo</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 28, color: 'var(--text-2)' }}>
                  {loading ? 'Carregando…' : 'Nenhum template cadastrado. Clique em "Novo Template" para criar o primeiro.'}
                </td>
              </tr>
            )}
            {templates.map(t => {
              const cfg = ACTIVITY_TYPE_CONFIG[t.activityType as keyof typeof ACTIVITY_TYPE_CONFIG];
              const badVars = unknownTemplateVariables(`${t.subject ?? ''}\n${t.body}`);
              return (
                <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.name}
                      {badVars.length > 0 && (
                        <span title={`Variável(is) sem valor: ${badVars.map(v => `{{${v}}}`).join(', ')}`}>
                          <Icon name="AlertTriangle" size={13} color="#B45309" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, border: 'none' }}>
                    {cfg && <Icon name={cfg.icon} size={14} color={cfg.color} />} {cfg?.label ?? t.activityType}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{ROLE_LABEL[(t.role as TemplateRole) ?? 'all'] ?? t.role}</td>
                  <td style={{ fontSize: 12.5 }}>{FUNNEL_TYPE_LABEL[(t.funnelType as TemplateFunnelType) ?? 'all'] ?? t.funnelType}</td>
                  <td style={{ fontSize: 12.5 }}>{t.productId ? PRODUCT_LABEL[t.productId] : 'Todos'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{t.usageCount ?? 0}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="icon-btn"
                      title={t.isActive ? 'Desativar template' : 'Reativar template'}
                      aria-label={t.isActive ? `Desativar template ${t.name}` : `Reativar template ${t.name}`}
                      onClick={() => handleToggleActive(t)}
                    >
                      <Icon name={t.isActive ? 'ToggleRight' : 'ToggleLeft'} size={22} color={t.isActive ? 'var(--primary)' : '#9aa3af'} />
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Editar template" aria-label={`Editar template ${t.name}`} onClick={() => openEdit(t)}>
                      <Icon name="Pencil" size={15} />
                    </button>
                    <button className="icon-btn" title="Excluir template" aria-label={`Excluir template ${t.name}`} onClick={() => setDeleteTarget(t)}>
                      <Icon name="Trash2" size={15} color="#B91C1C" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal criar/editar */}
      {showForm && (
        <div className="modal-ov" style={{ zIndex: 300 }} onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>{editing ? `Editar Template — ${editing.name}` : 'Novo Template'}</h3>
              <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Fechar"><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome *</div>
                  <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Primeiro contato — WizMart" />
                </div>

                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                    <div className="fl">Canal *</div>
                    <select className="input" value={form.activityType} onChange={e => setForm(f => ({ ...f, activityType: e.target.value as TemplateChannel }))}>
                      {CHANNELS.map(c => <option key={c} value={c}>{ACTIVITY_TYPE_CONFIG[c].label}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                    <div className="fl">Papel</div>
                    <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as TemplateRole }))}>
                      {(Object.keys(ROLE_LABEL) as TemplateRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                    <div className="fl">Funil</div>
                    <select className="input" value={form.funnelType} onChange={e => setForm(f => ({ ...f, funnelType: e.target.value as TemplateFunnelType }))}>
                      {(Object.keys(FUNNEL_TYPE_LABEL) as TemplateFunnelType[]).map(ft => <option key={ft} value={ft}>{FUNNEL_TYPE_LABEL[ft]}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                    <div className="fl">Produto</div>
                    <select className="input" value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value as ProductId | '' }))}>
                      <option value="">Todos</option>
                      {(Object.keys(PRODUCT_LABEL) as ProductId[]).map(p => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
                    </select>
                  </div>
                </div>

                {form.activityType === 'email' && (
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Assunto *</div>
                    <input className="input" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ex: Olá {{contato}}, conheça o WizMart!" />
                  </div>
                )}

                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Mensagem *</div>
                  <textarea
                    className="input"
                    rows={6}
                    required
                    value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder={'Olá {{contato}},\n\nA {{empresa}} pode...'}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5 }}
                  />
                </div>

                {/* Catálogo de variáveis disponíveis */}
                <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="Braces" size={13} /> Variáveis disponíveis
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TEMPLATE_VARIABLES.map(v => (
                      <code key={v.key} title={v.label} style={{ fontSize: 11.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}>
                        {`{{${v.key}}}`}
                      </code>
                    ))}
                  </div>
                </div>

                {unknownVars.length > 0 && (
                  <div style={{ background: '#FEF3C7', borderLeft: '4px solid #F59E0B', borderRadius: '0 8px 8px 0', padding: '10px 14px', fontSize: 12.5, color: '#92400E', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Icon name="AlertTriangle" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      {unknownVars.length === 1 ? 'Variável' : 'Variáveis'} sem valor real:{' '}
                      {unknownVars.map(v => `{{${v}}}`).join(', ')} — vai aparecer literalmente na mensagem enviada.
                      Confira a lista de variáveis disponíveis acima.
                    </span>
                  </div>
                )}

                {/* Preview ao vivo */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--bg-2)', padding: '6px 12px', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="Eye" size={13} /> Preview com dados de exemplo
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 13 }}>
                    {form.activityType === 'email' && (
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{previewSubject || <span className="muted">(sem assunto)</span>}</div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                      {previewBody || <span className="muted">(sem mensagem)</span>}
                    </div>
                  </div>
                </div>

                {formError && <div style={{ color: '#B91C1C', fontSize: 12.5, fontWeight: 600 }}>{formError}</div>}
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {deleteTarget && (
        <div className="modal-ov" style={{ zIndex: 310 }} onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd"><h3 style={{ fontSize: 15 }}>Excluir template "{deleteTarget.name}"?</h3></div>
            <div className="modal-bd" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              O template deixa de aparecer no seletor dos modais de Email/WhatsApp do card. Atividades já registradas
              com este template são preservadas. Se a intenção é pausar temporariamente, use o botão de desativar.
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
