/**
 * DealSidebar.tsx — Painel lateral de negócio v3
 *
 * Novidades v3:
 *  - Dados reais do deal (sem mocks)
 *  - Produto principal + cross-sell (additionalProducts multi-select)
 *  - CNPJ lookup via BrasilAPI para auto-preencher empresa
 *  - Badge de porte (clientSize) e tipo de conexão para Smart Café
 *  - Aba "Produtos" dedicada com gerenciamento cross-sell
 *  - "Ganhar" move para 'inaugurado' (WizMart) ou 'instalacao_realizada' (Smart Café)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { isDealComissionavel } from '../comissoes/calc';
import type { Deal, Seller, Stage, ProductSKU, Contact, Activity } from '../../types/crm';
import {
  PRODUCT_SKU_LABELS,
  PRODUCT_SKU_BY_FUNNEL,
} from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { fmtCurrency, sellerById } from '../../utils/crmFormat';
import { ProjectRequestModal } from '../projetos/ProjectRequestModal';
import { EmailActionModal } from './actions/EmailActionModal';
import { WhatsAppActionModal } from './actions/WhatsAppActionModal';
import { MeetingActionModal } from './actions/MeetingActionModal';

// ── Constantes ────────────────────────────────────────────────────────────────

interface DealSidebarProps {
  dealId: string;
  onClose: () => void;
  onPoints: (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;
}

const GTASKS = [
  { k: 'e', icon: 'Mail',          color: '#1A6B1A', title: 'Enviar email',       pts: 15 },
  { k: 'w', icon: 'MessageCircle', color: '#25D366', title: 'Mensagem WhatsApp',  pts: 20 },
  { k: 'm', icon: 'Calendar',      color: '#F59E0B', title: 'Agendar reunião',    pts: 30 },
];

const CLIENT_SIZE_LABEL: Record<string, string> = {
  small:  'Pequeno',
  medium: 'Médio',
  large:  'Grande',
};

const CLIENT_SIZE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  small:  { bg: '#FAF2EC', text: '#5E3A26', border: '#D4A37344' },
  medium: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B44' },
  large:  { bg: '#EFF6FF', text: '#1E3A5F', border: '#3B82F644' },
};

const CONNECTION_TYPE_LABEL: Record<string, string> = {
  standard_proposal: 'Proposta Padrão',
  meeting_scheduled: 'Reunião Agendada',
  visit_scheduled:   'Visita Agendada',
};

// ── CNPJ lookup via BrasilAPI ─────────────────────────────────────────────────

interface CnpjData {
  razao_social: string;
  nome_fantasia?: string;
  cnae_fiscal_descricao?: string;
  municipio?: string;
  uf?: string;
}

async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v2/${digits}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fmtCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DealSidebar({ dealId, onClose, onPoints }: DealSidebarProps) {
  const [tab, setTab] = useState<'overview' | 'produtos' | 'activities' | 'history'>('overview');

  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: deals }   = useFirestoreCollection<Deal>('deals');
  const { data: sellers } = useFirestoreCollection<Seller>('sellers');
  const { data: stages }  = useFirestoreCollection<Stage>('stages');
  const { data: contacts } = useFirestoreCollection<Contact>('contacts');
  const { data: activities } = useFirestoreCollection<Activity>('activities');
  const { updateDocument } = useFirestoreMutations('deals');

  const deal = deals.find(d => d.id === dealId);

  // Modal de ação ativo (email / whatsapp / reunião)
  const [actionModal, setActionModal] = useState<'email' | 'whatsapp' | 'meeting' | null>(null);

  // ── Estado tasks ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState({ e: false, w: false, m: false });
  useEffect(() => {
    if (deal) setTasks({ ...deal.tasks });
  }, [deal]);

  // ── Estado CNPJ ───────────────────────────────────────────────────────────
  const [cnpjInput,   setCnpjInput]   = useState('');
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjResult,  setCnpjResult]  = useState<CnpjData | null>(null);
  const [cnpjError,   setCnpjError]   = useState('');

  // ── Estado cross-sell ─────────────────────────────────────────────────────
  const [savingProducts, setSavingProducts] = useState(false);
  const [selectedAdditional, setSelectedAdditional] = useState<ProductSKU[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);

  useEffect(() => {
    if (deal) setSelectedAdditional(deal.additionalProducts ?? []);
  }, [deal]);

  // ── Animação de entrada ───────────────────────────────────────────────────
  useEffect(() => {
    anime({
      targets: '.deal-panel',
      translateX: [400, 0],
      opacity: [0.9, 1],
      duration: 350,
      easing: 'cubicBezier(0.22, 1, 0.36, 1)',
    });
  }, [dealId]);

  if (!deal) return null;

  const s  = sellerById(sellers, deal.assignedRepId || deal.assignedSdrId || deal.owner);
  // fallback estágio: usa deal.stage como nome se não encontrado em legado
  const stageName = (stages.find(st => st.id === deal.stage)?.name) ?? deal.stage ?? '—';
  const prodColor = deal.productId === 'smart_cafe' ? '#5E3A26' : '#1A6B1A';
  const prodLabel = deal.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart';

  // SKUs do outro produto (cross-sell)
  const crossFunnel = deal.productId === 'wizmart' ? 'smart_cafe' : 'wizmart';
  const crossSkus: ProductSKU[] = PRODUCT_SKU_BY_FUNNEL[crossFunnel];
  const mainSkus: ProductSKU[]  = deal.productId ? PRODUCT_SKU_BY_FUNNEL[deal.productId] : [];

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Abre o modal de ação correspondente à tarefa (e=email, w=whatsapp, m=reunião).
  // O registro no card passa a ser feito automaticamente pelo modal (useLogActivity).
  const TASK_TO_ACTION: Record<string, 'email' | 'whatsapp' | 'meeting'> = {
    e: 'email', w: 'whatsapp', m: 'meeting',
  };
  const abrirAcao = (g: typeof GTASKS[0]) => {
    setActionModal(TASK_TO_ACTION[g.k]);
  };

  const handleStageChange = async (newStatus: 'won' | 'lost') => {
    try {
      await updateDocument(deal.id, {
        status: newStatus,
        stage: newStatus === 'won'
          ? (deal.productId === 'smart_cafe' ? 'instalacao_realizada' : 'inaugurado')
          : deal.stage,
        ...(newStatus === 'won' ? { cohortKeys: { ...deal.cohortKeys, conquestMonth: new Date().toISOString().slice(0, 7) } } : {}),
        updatedAt: new Date(),
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCnpjLookup = async () => {
    const digits = cnpjInput.replace(/\D/g, '');
    if (digits.length !== 14) { setCnpjError('CNPJ deve ter 14 dígitos.'); return; }
    setCnpjLoading(true);
    setCnpjError('');
    setCnpjResult(null);
    const data = await fetchCnpj(digits);
    setCnpjLoading(false);
    if (!data) { setCnpjError('CNPJ não encontrado ou serviço indisponível.'); return; }
    setCnpjResult(data);
  };

  const handleApplyCnpj = async () => {
    if (!cnpjResult) return;
    const company = cnpjResult.nome_fantasia || cnpjResult.razao_social;
    try {
      await updateDocument(deal.id, { company, updatedAt: new Date() });
      setCnpjResult(null);
      setCnpjInput('');
      onPoints({ pts: 5, custom: '✅ Empresa atualizada via CNPJ' });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAdditional = (sku: ProductSKU) => {
    setSelectedAdditional(prev =>
      prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku],
    );
  };

  const saveProducts = async () => {
    setSavingProducts(true);
    try {
      await updateDocument(deal.id, { additionalProducts: selectedAdditional, updatedAt: new Date() });
      onPoints({ pts: 0, custom: '💼 Produtos cross-sell atualizados' });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProducts(false);
    }
  };

  // ── Renders ───────────────────────────────────────────────────────────────

  const podeComissionar =
    (user?.role === 'manager' || user?.role === 'master') && isDealComissionavel(deal.stage);

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Atalho: calcular comissão (gestor, negócio ativado) */}
      {podeComissionar && (
        <button
          className="btn btn-primary btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => navigate(`/comissoes?deal=${deal.id}`)}
        >
          <Icon name="Calculator" size={14} />
          Calcular comissão
        </button>
      )}

      {/* Dados principais */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[
          ['Empresa',      deal.company],
          ['Valor',        fmtCurrency(deal.value)],
          ['Estágio',      stageName],
          ['Vencimento',   deal.due],
          ['Responsável',  s.name],
          ['Produto',      prodLabel],
        ].map(([l, v]) => (
          <div key={l} className="field">
            <div className="fl">{l}</div>
            <div className="fv" style={l === 'Valor' ? { color: 'var(--primary)', fontWeight: 700 } : l === 'Produto' ? { color: prodColor, fontWeight: 700 } : undefined}>
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Smart Café — porte + conexão */}
      {deal.productId === 'smart_cafe' && (deal.clientSize || deal.connectionType) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {deal.clientSize && (() => {
            const c = CLIENT_SIZE_COLOR[deal.clientSize!] ?? CLIENT_SIZE_COLOR.small;
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                <Icon name="Building2" size={11} />
                {CLIENT_SIZE_LABEL[deal.clientSize!]}
              </span>
            );
          })()}
          {deal.connectionType && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <Icon name="Link2" size={11} />
              {CONNECTION_TYPE_LABEL[deal.connectionType] ?? deal.connectionType}
            </span>
          )}
        </div>
      )}

      {/* Produto principal + cross-sell resumo */}
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Produtos</div>
        {deal.mainProduct && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: prodColor, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: prodColor }}>{PRODUCT_SKU_LABELS[deal.mainProduct]}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-2)', padding: '1px 7px', borderRadius: 100 }}>Principal</span>
          </div>
        )}
        {deal.additionalProducts && deal.additionalProducts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {deal.additionalProducts.map(sku => (
              <span key={sku} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 100, background: '#F0F4FF', color: '#3730A3', border: '1px solid #C7D2FE' }}>
                {PRODUCT_SKU_LABELS[sku]}
              </span>
            ))}
          </div>
        )}
        {!deal.mainProduct && (!deal.additionalProducts || deal.additionalProducts.length === 0) && (
          <p className="muted" style={{ fontSize: 12 }}>Nenhum produto configurado. Use a aba <strong>Produtos</strong> para definir.</p>
        )}
      </div>

      {/* CNPJ Lookup */}
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Buscar por CNPJ</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="00.000.000/0001-00"
            value={cnpjInput}
            onChange={e => setCnpjInput(fmtCnpj(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleCnpjLookup()}
            maxLength={18}
          />
          <button
            className="btn btn-outline btn-sm"
            style={{ flexShrink: 0 }}
            onClick={handleCnpjLookup}
            disabled={cnpjLoading}
          >
            {cnpjLoading
              ? <Icon name="Loader2" size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Icon name="Search" size={14} />}
          </button>
        </div>
        {cnpjError && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{cnpjError}</p>}
        {cnpjResult && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{cnpjResult.razao_social}</div>
            {cnpjResult.nome_fantasia && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{cnpjResult.nome_fantasia}</div>}
            {cnpjResult.cnae_fiscal_descricao && <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{cnpjResult.cnae_fiscal_descricao}</div>}
            {cnpjResult.municipio && <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{cnpjResult.municipio} / {cnpjResult.uf}</div>}
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={handleApplyCnpj}>
              <Icon name="Check" size={13} /> Usar estes dados
            </button>
          </div>
        )}
      </div>

      {/* Tarefas Gamificadas */}
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Tarefas Gamificadas</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {GTASKS.map(g => {
            const done = tasks[g.k as 'e' | 'w' | 'm'];
            return (
              <div key={g.k} className={`gtask ${done ? 'done' : ''}`} style={{ transition: 'background-color 0.2s' }}>
                <div className="gtop">
                  {done ? (
                    <div id={`chk-${g.k}`} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="Check" size={14} color="#fff" strokeWidth={3} />
                    </div>
                  ) : (
                    <button onClick={() => abrirAcao(g)} className="chk" id={`chk-${g.k}`} />
                  )}
                  <Icon name={g.icon as any} size={16} color={g.color} style={{ marginLeft: 'auto' }} />
                </div>
                <div className="gname">{g.title}</div>
                <span className="badge badge-accent" style={{ alignSelf: 'flex-start' }}>+ {g.pts} pts</span>
                {done
                  ? <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => abrirAcao(g)}>Registrar novamente</button>
                  : <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => abrirAcao(g)}>Abrir</button>
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderProdutos = () => {
    const isDirty = JSON.stringify(selectedAdditional.slice().sort()) !== JSON.stringify((deal.additionalProducts ?? []).slice().sort());

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Produto principal (somente leitura) */}
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Produto Principal</div>
          {deal.mainProduct
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-2)', border: '1.5px solid var(--border)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: prodColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13.5, color: prodColor }}>{PRODUCT_SKU_LABELS[deal.mainProduct]}</span>
              </div>
            )
            : <p className="muted" style={{ fontSize: 12 }}>Produto principal não definido. Edite o negócio para configurar.</p>
          }
        </div>

        {/* Cross-sell — produtos do outro produto */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="label">Cross-sell</div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Produtos do outro portfólio</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {crossSkus.map(sku => {
              const checked = selectedAdditional.includes(sku);
              return (
                <button
                  key={sku}
                  onClick={() => toggleAdditional(sku)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                    border: `1.5px solid ${checked ? '#6366F1' : 'var(--border)'}`,
                    background: checked ? '#EEF2FF' : 'var(--card)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? '#6366F1' : 'var(--border)'}`,
                    background: checked ? '#6366F1' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}>
                    {checked && <Icon name="Check" size={11} color="#fff" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400, color: checked ? '#4338CA' : 'var(--text)' }}>
                    {PRODUCT_SKU_LABELS[sku]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Produtos do mesmo portfólio (adicional) */}
        {mainSkus.length > 1 && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Adicionais do mesmo portfólio</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mainSkus.filter(sku => sku !== deal.mainProduct).map(sku => {
                const checked = selectedAdditional.includes(sku);
                return (
                  <button
                    key={sku}
                    onClick={() => toggleAdditional(sku)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                      border: `1.5px solid ${checked ? prodColor : 'var(--border)'}`,
                      background: checked ? (deal.productId === 'smart_cafe' ? '#FAF2EC' : '#F0F7F0') : 'var(--card)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? prodColor : 'var(--border)'}`,
                      background: checked ? prodColor : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {checked && <Icon name="Check" size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400, color: checked ? prodColor : 'var(--text)' }}>
                      {PRODUCT_SKU_LABELS[sku]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Salvar */}
        {isDirty && (
          <button
            className="btn btn-primary"
            onClick={saveProducts}
            disabled={savingProducts}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          >
            {savingProducts
              ? <Icon name="Loader2" size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Icon name="Save" size={14} />}
            Salvar produtos
          </button>
        )}
      </div>
    );
  };

  const renderActivities = () => {
    const ACT_ICON: Record<string, { i: string; c: string; label: string }> = {
      email:    { i: 'Mail',          c: '#1A6B1A', label: 'Email' },
      whatsapp: { i: 'MessageCircle', c: '#25D366', label: 'WhatsApp' },
      meeting:  { i: 'Calendar',      c: '#F59E0B', label: 'Reunião' },
      visit:    { i: 'MapPin',        c: '#3B82F6', label: 'Visita' },
      call:     { i: 'Phone',         c: '#F59E0B', label: 'Ligação' },
      note:     { i: 'StickyNote',    c: '#6B7280', label: 'Nota' },
    };

    const fmtWhen = (a: Activity): string => {
      const raw = a.completedAt ?? a.scheduledAt ?? a.createdAt;
      const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) return '';
      const datePart = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const prefix = a.status === 'pending' ? 'Agendado p/ ' : '';
      return `${prefix}${datePart}, ${timePart}`;
    };

    const dealActivities = activities
      .filter(a => a.dealId === deal.id)
      .sort((x, y) => {
        const dx = (x.completedAt ?? x.scheduledAt ?? x.createdAt)?.toDate?.()?.getTime?.()
          ?? new Date(x.completedAt ?? x.scheduledAt ?? x.createdAt ?? 0).getTime();
        const dy = (y.completedAt ?? y.scheduledAt ?? y.createdAt)?.toDate?.()?.getTime?.()
          ?? new Date(y.completedAt ?? y.scheduledAt ?? y.createdAt ?? 0).getTime();
        return dy - dx;
      });

    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button className="btn btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActionModal('email')}>
            <Icon name="Mail" size={14} color="#1A6B1A" /> Email
          </button>
          <button className="btn btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActionModal('whatsapp')}>
            <Icon name="MessageCircle" size={14} color="#25D366" /> WhatsApp
          </button>
          <button className="btn btn-outline btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setActionModal('meeting')}>
            <Icon name="Calendar" size={14} color="#F59E0B" /> Reunião
          </button>
        </div>
        {dealActivities.length === 0 ? (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-2)' }}>
            <Icon name="Inbox" size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div style={{ fontSize: 13 }}>Nenhuma atividade ainda.</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Use os botões acima — o registro é automático.</div>
          </div>
        ) : (
          <div className="tl">
            {dealActivities.map((a, i) => {
              const ic = ACT_ICON[a.type] ?? ACT_ICON.note;
              const who = sellerById(sellers, a.userId).name;
              return (
                <div key={a.id ?? i} className="tl-item">
                  <div className="tl-ic" style={{ background: ic.c }}>
                    <Icon name={ic.i as any} size={15} />
                  </div>
                  <div className="tl-body">
                    <div>{a.outcome || ic.label}</div>
                    <div className="tl-time">
                      {ic.label} · {who} · {fmtWhen(a)}
                      {a.status === 'pending' && <span className="badge" style={{ marginLeft: 6, background: '#FEF3C7', color: '#B45309', fontSize: 10 }}>Agendado</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => (
    <div>
      <div className="tl">
        {[
          { icon: 'ArrowRight', color: '#6366F1', text: `Estágio atual: ${stageName}`,              time: 'agora' },
          { icon: 'User',       color: '#1A6B1A', text: `Responsável: ${s.name}`,                  time: 'criação' },
          { icon: 'Calendar',   color: '#F59E0B', text: `Vencimento: ${deal.due}`,                  time: 'definido' },
        ].map((h, i) => (
          <div key={i} className="tl-item">
            <div className="tl-ic" style={{ background: h.color }}>
              <Icon name={h.icon as any} size={14} />
            </div>
            <div className="tl-body">
              <div>{h.text}</div>
              <div className="tl-time">{h.time}</div>
            </div>
          </div>
        ))}
      </div>
      {/* cohortKeys debug (só master/dev) */}
      {deal.cohortKeys && Object.keys(deal.cohortKeys).length > 0 && (
        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: 6 }}>Cohort Keys</div>
          {Object.entries(deal.cohortKeys).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
              <span className="muted">{k}</span>
              <span style={{ fontWeight: 600 }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── JSX principal ─────────────────────────────────────────────────────────

  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="deal-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="deal-hd">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: prodColor + '18', color: prodColor }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: prodColor }} />
                {prodLabel}
              </span>
              <span className="badge badge-primary">{stageName}</span>
            </div>
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Fechar painel">
              <Icon name="X" size={18} />
            </button>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <h1 className="h1" style={{ flex: 1, lineHeight: 1.2 }}>{deal.name}</h1>
            <Icon name="Pencil" size={15} color="#9aa3af" style={{ cursor: 'pointer' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div className="money" style={{ color: 'var(--primary)', fontSize: 18 }}>
              {fmtCurrency(deal.value)}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{deal.company}</span>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => handleStageChange('won')}>
              <Icon name="Trophy" size={14} /> Ganhar
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => handleStageChange('lost')}>
              <Icon name="X" size={14} /> Perder
            </button>
            <button className="btn btn-outline btn-sm">
              <Icon name="Pencil" size={14} /> Editar
            </button>
            {deal.mainProduct === 'wizmart_minimercado' && (
              <button
                className="btn btn-sm"
                style={{ background: '#1A3E00', color: '#fff', border: 'none' }}
                onClick={() => setShowProjectModal(true)}
              >
                <Icon name="PenLine" size={13} /> Solicitar Projeto
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="deal-tabs">
          {([
            ['overview',    'Visão Geral'],
            ['produtos',    'Produtos'],
            ['activities',  'Atividades'],
            ['history',     'Histórico'],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              className={`deal-tab ${tab === k ? 'active' : ''}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="deal-body">
          {tab === 'overview'   && renderOverview()}
          {tab === 'produtos'   && renderProdutos()}
          {tab === 'activities' && renderActivities()}
          {tab === 'history'    && renderHistory()}
        </div>

      </div>
    </div>

    {/* ProjectRequestModal — WizMart Minimercado (fora do overlay para z-index correto) */}
    {showProjectModal && (
      <ProjectRequestModal
        deal={deal}
        onClose={() => setShowProjectModal(false)}
        onSuccess={() => onPoints({ pts: 0, custom: '📐 Projeto de layout solicitado!' })}
      />
    )}

    {/* Modais de ação com registro automático no card */}
    {actionModal === 'email' && (
      <EmailActionModal deal={deal} contacts={contacts} onClose={() => setActionModal(null)} onPoints={onPoints} />
    )}
    {actionModal === 'whatsapp' && (
      <WhatsAppActionModal deal={deal} contacts={contacts} onClose={() => setActionModal(null)} onPoints={onPoints} />
    )}
    {actionModal === 'meeting' && (
      <MeetingActionModal deal={deal} contacts={contacts} onClose={() => setActionModal(null)} onPoints={onPoints} />
    )}
    </>
  );
}

export default DealSidebar;
