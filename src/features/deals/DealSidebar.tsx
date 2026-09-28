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

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { isDealComissionavel } from '../comissoes/calc';
import type { Deal, Seller, Stage, ProductSKU, Contact, Activity, Handoff } from '../../types/crm';
import {
  PRODUCT_SKU_LABELS,
  PRODUCT_SKU_BY_FUNNEL,
} from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { fmtCurrency, sellerById } from '../../utils/crmFormat';
import { ProjectRequestModal } from '../projetos/ProjectRequestModal';
import { canRequestProject } from '../projetos/projectAccess';
import { EmailActionModal } from './actions/EmailActionModal';
import { WhatsAppActionModal } from './actions/WhatsAppActionModal';
import { MeetingActionModal } from './actions/MeetingActionModal';
import { StandbyModal } from './StandbyModal';
import { LostReasonModal } from './LostReasonModal';
import { getLostReasonLabel, requeuesToBdr } from '../../utils/lostReasonUtils';
import { getLastActivityAt, isCardExpired, daysSinceLastActivity } from '../../utils/cardExpirationUtils';
import type { LostReasonId } from '../../types/crm';
import { dealParticipantConstraint } from '../../utils/dealQueryScope';
import { COMPANY_SIZE_LABEL, COMPANY_SIZE_COLOR, effectiveCompanySize, type CompanySizeEstimate } from '../../utils/companySize';
import { getSdrWorkload } from '../../utils/sdrWorkload';
import { AssignSdrModal } from '../pipeline/AssignSdrModal';
import { ChangeResponsibleModal } from './ChangeResponsibleModal';
import { usePermissions } from '../../hooks/usePermissions';
import { mergePeople } from '../../utils/people';
import { computeResponsibleId } from '../../utils/dealParticipants';
import { buildResponsibleChange, eligibleResponsibles, RESPONSIBLE_FIELD_LABEL } from '../../utils/dealResponsible';
import { ContractSlot } from './ContractSlot';
import { splitDealActivities } from './dealActivities';
import { projectTimelineSteps } from './dealTimeline';
import { useDealTimeline } from './useDealTimeline';
import { ContactSelector, type NewContactInput } from './ContactSelector';
// Aba Notas em lazy: só quem abre a aba baixa a pilha de markdown (chunk
// 'markdown' no vite.config.ts).
const NotesTab = lazy(() => import('./notes/NotesTab').then(m => ({ default: m.NotesTab })));

// ── Constantes ────────────────────────────────────────────────────────────────

interface DealSidebarProps {
  dealId: string;
  onClose: () => void;
  onPoints: (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;
  /** 'panel' (padrão): painel lateral com overlay | 'page': página inteira (rota /lead/:id) */
  variant?: 'panel' | 'page';
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

export function DealSidebar({ dealId, onClose, onPoints, variant = 'panel' }: DealSidebarProps) {
  const [tab, setTab] = useState<'overview' | 'produtos' | 'activities' | 'notas' | 'history'>('overview');
  const isPage = variant === 'page';

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const timelineEvents = useDealTimeline(dealId);
  const { hasPermission } = usePermissions();

  const { data: deals }   = useFirestoreCollection<Deal>('deals', dealParticipantConstraint(user, hasPermission('manage_deal_cards')));
  const { data: legacySellers } = useFirestoreCollection<Seller>('sellers');
  const { data: stages }  = useFirestoreCollection<Stage>('stages');
  const { data: contacts } = useFirestoreCollection<Contact>('contacts');
  const { data: activities } = useFirestoreCollection<Activity>('activities');
  // Jornada do lead: handoffs deste deal (viewer/design não leem — hook devolve vazio)
  const { data: handoffs } = useFirestoreCollection<Handoff>('handoffs');
  // SDRs ativos + carga atual — só usado pro botão "Atribuir SDR" (Fase D2/D3),
  // mas o hook precisa rodar sempre (Rules of Hooks).
  const { data: allUsers } = useFirestoreCollection<any>('users');
  // Nomes/avatares: `users` primeiro (todo convidado só existe lá), `sellers` legado como reserva.
  const sellers = useMemo(() => mergePeople(allUsers, legacySellers), [allUsers, legacySellers]);
  const { updateDocument } = useFirestoreMutations('deals');
  const { addDocument: addActivity, updateDocument: updateActivity } = useFirestoreMutations('activities');
  const { addDocument: addContact } = useFirestoreMutations('contacts');

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
  const [showStandbyModal, setShowStandbyModal] = useState(false);
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);

  // ── Estado de edição do negócio (nome, empresa, valor, vencimento) ────────
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editDue, setEditDue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Estado porte estimado (Fase D3) ───────────────────────────────────────
  const [savingSize, setSavingSize] = useState(false);

  // ── Estado atribuição manual de SDR (Fase D2) ─────────────────────────────
  const [showAssignSdrModal, setShowAssignSdrModal] = useState(false);

  // ── Estado troca de responsável (autorização manage_deal_cards) ───────────
  const [showChangeResponsibleModal, setShowChangeResponsibleModal] = useState(false);

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

  // Vencimento do card por inatividade (Observações do cliente, jul/2026):
  // 21 dias sem atividade concluída.
  const lastActivityAt = getLastActivityAt(activities, deal.id);
  const cardExpired = isCardExpired(deal, lastActivityAt);
  const daysInactive = daysSinceLastActivity(deal, lastActivityAt);

  // Mesma cadeia da CF onDealParticipantsChanged (rep > sdr > bdr > dono) — antes
  // pulava o BDR, o que mostrava o dono errado depois de uma troca de responsável.
  const s  = sellerById(sellers, deal.responsibleId || computeResponsibleId(deal));
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

  const handleStageChange = async (newStatus: 'won') => {
    try {
      // cohortKeys (conquestMonth) são gravados pela CF onDealStageChanged ao
      // detectar o novo estágio — escrevê-los aqui violava as security rules
      // e fazia o botão Ganhou falhar silenciosamente para todos os papéis.
      await updateDocument(deal.id, {
        status: newStatus,
        stage: deal.productId === 'smart_cafe' ? 'instalacao_realizada' : 'inaugurado',
        updatedAt: new Date(),
      });
      onClose();
    } catch (err) {
      console.error(err);
      onPoints({ pts: 0, custom: '⚠️ Não foi possível atualizar o negócio. Tente novamente.' });
    }
  };

  // Perder exige motivo estruturado (Observações do cliente, jul/2026) — ver
  // LostReasonModal. Dois motivos devolvem o lead ao BDR para nova tentativa.
  const handleConfirmLost = async (reasonId: LostReasonId, note: string) => {
    const requeue = requeuesToBdr(reasonId);
    const patch: Record<string, any> = {
      status: 'lost',
      lostReason: reasonId,
      updatedAt: new Date(),
    };
    if (note) patch.lostReasonNote = note;
    if (requeue) {
      patch.assignedSdrId = null;
      patch.requeuedForBdr = true;
      patch.requeuedAt = new Date();
    }
    await updateDocument(deal.id, patch);

    if (user?.uid) {
      const label = getLostReasonLabel(reasonId);
      await addActivity({
        type: 'note',
        dealId: deal.id,
        userId: user.uid,
        text: `Negócio perdido — ${label}${requeue ? ' (devolvido ao BDR para nova tentativa)' : ''}`,
        status: 'completed',
        cadenceType: 'manual',
        coinsAwarded: 0,
        wasOnTime: true,
        productId: deal.productId || 'wizmart',
      });
    }

    setShowLostReasonModal(false);
    onPoints({ pts: 0, custom: requeue ? '↩️ Negócio perdido — devolvido ao BDR' : '❌ Negócio marcado como perdido' });
    onClose();
  };

  // Papéis operacionais podem favoritar/anotar (viewer e design são leitura)
  const canEditDeal = user?.role !== 'viewer' && user?.role !== 'design';

  const toggleFavorite = async () => {
    try {
      await updateDocument(deal.id, { isFavorite: !deal.isFavorite, updatedAt: new Date() });
    } catch (err) {
      console.error(err);
      onPoints({ pts: 0, custom: '⚠️ Não foi possível atualizar o favorito.' });
    }
  };

  // Porte estimado (Fase D3) — BDR chuta na criação, SDR revisa depois de
  // pesquisar mais a fundo. Campo simples, sem histórico de quem mudou.
  const canEditCompanySize = user?.role === 'bdr' || user?.role === 'sdr' || user?.role === 'master' || user?.role === 'manager';
  const updateCompanySize = async (size: CompanySizeEstimate) => {
    setSavingSize(true);
    try {
      await updateDocument(deal.id, { companySizeEstimate: size, updatedAt: new Date() });
    } catch (err) {
      console.error('[DealSidebar] Erro ao atualizar porte:', err);
    } finally {
      setSavingSize(false);
    }
  };

  // Atribuição manual BDR→SDR (Fase D2) — mesma ação que já existia só no
  // painel do BDR ("Leads aguardando distribuição"), agora também aqui no
  // card, que é onde o Alan esperava encontrar. Só o BDR dono do lead (ou
  // gestão) vê o botão, e só enquanto o lead ainda está em `in_queue`.
  const canAssignSdr = deal.status === 'in_queue'
    && (user?.role === 'manager' || user?.role === 'master' || (user?.role === 'bdr' && deal.bdrId === user?.uid));
  const activeSdrs = allUsers.filter((u: any) => u.role === 'sdr' && u.isActive !== false);
  // `deals` já vem restrito a participação (mesmo caveat documentado em
  // PainelBDR/DashboardPage.tsx: carga pode ficar subestimada pra SDRs que
  // também trabalham leads de outros BDRs — fix correto é um callable).
  const sdrWorkloads = getSdrWorkload(deals, activeSdrs.map((s: any) => s.id), deal.productId || 'wizmart');
  // Troca de responsável — BDR, Gestor e Master (`manage_deal_cards`; a rule
  // `canManageAllDeals` autoriza pelo mesmo trio de papéis). Negócio fechado
  // (won/lost) não tem "dono" a trocar. Só o campo do responsável atual muda;
  // `participantIds`/`responsibleId` são recalculados pela CF.
  const canChangeResponsible = hasPermission('manage_deal_cards')
    && (deal.status === 'open' || deal.status === 'in_queue');
  const responsibleCandidates = eligibleResponsibles(deal, allUsers as any[]);
  const handleChangeResponsible = async (data: { newUid: string; notes?: string }) => {
    const { field, patch } = buildResponsibleChange(deal, data.newUid);
    const fromName = sellerById(sellers, computeResponsibleId(deal)).name;
    const toName = sellerById(sellers, data.newUid).name;
    await updateDocument(deal.id, { ...patch, updatedAt: new Date() });
    if (user?.uid) {
      await addActivity({
        type: 'note',
        dealId: deal.id,
        userId: user.uid,
        text: `Responsável (${RESPONSIBLE_FIELD_LABEL[field]}) alterado de ${fromName} para ${toName}${data.notes ? ` — ${data.notes}` : ''}`,
        status: 'completed',
        coinsAwarded: 0,
        wasOnTime: true,
        cadenceType: 'manual',
        productId: deal.productId || 'wizmart',
      });
    }
    setShowChangeResponsibleModal(false);
  };

  const handleAssignSdr = async (data: { sdrId: string; notes?: string }) => {
    await updateDocument(deal.id, {
      status: 'open',
      assignedSdrId: data.sdrId,
      assignedAt: new Date(),
      updatedAt: new Date(),
    });
    if (user?.uid) {
      await addActivity({
        type: 'note',
        dealId: deal.id,
        userId: user.uid,
        text: `Atribuído diretamente pelo BDR${data.notes ? ` — ${data.notes}` : ''}`,
        status: 'completed',
        coinsAwarded: 0,
        wasOnTime: true,
        cadenceType: 'manual',
        productId: deal.productId || 'wizmart',
      });
    }
    setShowAssignSdrModal(false);
  };

  // Registra (conclui) uma atividade pendente do próprio usuário — usado
  // principalmente para os follow-ups do Standby. A CF onActivityCompleted
  // cuida das moedas.
  const handleCompleteActivity = async (a: Activity) => {
    if (!a.id) return;
    try {
      await updateActivity(a.id, {
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      onPoints({ pts: 0, custom: '✅ Follow-up registrado!' });
    } catch (err) {
      console.error('[DealSidebar] Erro ao registrar atividade:', err);
      onPoints({ pts: 0, custom: '⚠️ Não foi possível registrar o follow-up.' });
    }
  };

  // Edição do negócio (nome, empresa, valor, vencimento) — os botões "Editar"
  // e o lápis ao lado do nome não tinham handler algum (bug relatado pelo
  // cliente); abrem/fecham este modo de edição inline.
  const openEdit = () => {
    setEditName(deal.name);
    setEditCompany(deal.company);
    setEditValue(String(deal.value ?? 0));
    setEditDue(deal.due && deal.due !== '—' ? deal.due : '');
    setIsEditing(true);
  };
  const cancelEdit = () => setIsEditing(false);
  const saveEdit = async () => {
    if (!editName.trim() || !editCompany.trim()) return;
    setSavingEdit(true);
    try {
      await updateDocument(deal.id, {
        name: editName.trim(),
        company: editCompany.trim(),
        value: parseFloat(editValue.replace(',', '.')) || 0,
        due: editDue.trim() || '—',
        updatedAt: new Date(),
      });
      setIsEditing(false);
      onPoints({ pts: 0, custom: '✅ Negócio atualizado' });
    } catch (err) {
      console.error('[DealSidebar] Erro ao editar deal:', err);
      onPoints({ pts: 0, custom: '⚠️ Não foi possível salvar as alterações.' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Vínculo de Contato (aba Visão Geral) — ver ContactSelector.tsx e
  // utils/dealContact.ts. `contactId` é a fonte de verdade para os modais de
  // Email/WhatsApp, substituindo o match frágil por nome da empresa.
  const handleLinkContact = async (contactId: string) => {
    await updateDocument(deal.id, { contactId, updatedAt: new Date() });
  };

  const handleCreateContact = async (data: NewContactInput): Promise<string> => {
    const ref = await addContact({
      ...data,
      company: deal.company,
      owner: user?.uid || '',
      productIds: deal.productId ? [deal.productId] : ['wizmart'],
      last: 'agora',
      tags: ['Novo'],
      deals: 0,
    });
    return ref.id;
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

      {/* Vencimento do card — 21 dias sem atividade (Observações do cliente, jul/2026) */}
      {cardExpired && (
        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <Icon name="AlarmClockOff" size={18} color="#B91C1C" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>
              Card vencido — {daysInactive} dias sem atividade
            </div>
            <p style={{ fontSize: 12, color: '#7F1D1D', margin: '2px 0 8px' }}>
              Nenhuma atividade concluída há 3 semanas ou mais. Marque o motivo da perda ou reative com Standby.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-danger btn-sm" onClick={() => setShowLostReasonModal(true)}>
                <Icon name="X" size={13} /> Marcar como perdido
              </button>
              {!deal.standbyActive && (
                <button
                  className="btn btn-sm"
                  style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B44' }}
                  onClick={() => setShowStandbyModal(true)}
                >
                  <Icon name="PauseCircle" size={13} /> Reativar com Standby
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Contrato de Comodato Smart Café (Fase 5.4) — some sozinho para outros SKUs */}
      <ContractSlot deal={deal} />

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

      {/* Vínculo de Contato — fonte de verdade pros modais de Email/WhatsApp
          (achado crítico, PLANO_DESENHO_CRM.md 13/09/2026) */}
      <ContactSelector
        deal={deal}
        contacts={contacts}
        onLink={handleLinkContact}
        onCreateContact={handleCreateContact}
        readOnly={!canEditDeal}
      />

      {/* Assinaturas do card — quem participou de cada etapa fica sempre visível,
          mesmo depois da passagem de bastão (Observações do cliente, jul/2026) */}
      {(deal.bdrId || deal.assignedSdrId || deal.assignedRepId || deal.owner) && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="label" style={{ fontSize: 10.5, marginBottom: 8 }}>Equipe do lead</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'BDR (origem)',        uid: deal.bdrId },
              { label: 'SDR responsável',     uid: deal.assignedSdrId },
              { label: 'Representante',       uid: deal.assignedRepId },
              // Card sem BDR/SDR/Rep: o dono É o responsável (e é o campo que a
              // troca de responsável altera) — sem esta linha a troca não aparecia aqui.
              { label: 'Dono do card',        uid: (deal.bdrId || deal.assignedSdrId || deal.assignedRepId) ? undefined : deal.owner },
            ].filter(r => r.uid).map(r => {
              const person = sellerById(sellers, r.uid!);
              return (
                <div key={r.label} className="row" style={{ gap: 8 }}>
                  <Av initials={person.initials} color={person.color} size={24} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{person.name}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{r.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Porte estimado da empresa (Fase D3) — chute do BDR, refinável pelo SDR.
          Diferente do clientSize do Smart Café (qualificação formal, mais abaixo). */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: canEditCompanySize ? 8 : 0 }}>
          <div className="label" style={{ fontSize: 10.5 }}>Porte estimado da empresa</div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
            background: COMPANY_SIZE_COLOR[effectiveCompanySize(deal)].bg,
            color: COMPANY_SIZE_COLOR[effectiveCompanySize(deal)].text,
            border: `1px solid ${COMPANY_SIZE_COLOR[effectiveCompanySize(deal)].border}`,
          }}>
            {COMPANY_SIZE_LABEL[effectiveCompanySize(deal)]}{!deal.companySizeEstimate && ' (padrão)'}
          </span>
        </div>
        {canEditCompanySize && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['P', 'M', 'G'] as const).map(sz => (
              <button
                key={sz}
                type="button"
                disabled={savingSize}
                onClick={() => updateCompanySize(sz)}
                className={`btn btn-sm ${effectiveCompanySize(deal) === sz ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
              >
                {COMPANY_SIZE_LABEL[sz]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Motivo da perda estruturado (Observações do cliente, jul/2026) */}
      {deal.status === 'lost' && (
        <div className="card" style={{ padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="X" size={15} color="#B91C1C" />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#B91C1C' }}>{getLostReasonLabel(deal.lostReason)}</div>
              {deal.lostReasonNote && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{deal.lostReasonNote}</div>}
              {deal.requeuedForBdr && (
                <div style={{ fontSize: 11, color: '#92400E', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="RotateCcw" size={11} /> Devolvido ao BDR para nova tentativa
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Projeto de layout — atalho na Visão Geral (o cliente não achava o botão
          do cabeçalho; PLANO_DESENHO_CRM_2.md, A1). */}
      {canRequestProject(user, deal) && (
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: '#F0F7F0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Icon name="PenLine" size={18} color="#1A6B1A" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Projeto de layout</div>
            <div className="muted" style={{ fontSize: 12 }}>Peça o projeto ao Design. O pedido e a entrega ficam registrados no histórico deste card.</div>
          </div>
          <button className="btn btn-sm" style={{ background: '#1A3E00', color: '#fff', border: 'none' }} onClick={() => setShowProjectModal(true)}>
            <Icon name="PenLine" size={13} /> Solicitar Projeto
          </button>
        </div>
      )}
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
      const raw = a.completedAt ?? a.scheduledAt ?? a.dueAt ?? a.createdAt;
      const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) return '';
      const datePart = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${datePart}, ${timePart}`;
    };

    // Slide 5 do Desenho CRM: "Como o SDR deve enxergar a cadência" — "Deve
    // enxergar individualmente ao abrir cada Card". Separado em duas listas
    // (não uma timeline só) para que o que ainda falta fazer não fique
    // enterrado sob o histórico — achado de QA manual, 12/09/2026.
    const { upcoming: pendingActivities, history: dealActivities } = splitDealActivities(activities, deal.id);

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
        {pendingActivities.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-2)', marginBottom: 8 }}>
              Próximas na Cadência
            </div>
            <div className="tl">
              {pendingActivities.map((a, i) => {
                const ic = ACT_ICON[a.type] ?? ACT_ICON.note;
                const isOverdue = a.status === 'overdue';
                const canComplete = a.userId === user?.uid;
                return (
                  <div key={a.id ?? `pend-${i}`} className="tl-item">
                    <div className="tl-ic" style={{ background: isOverdue ? '#B91C1C' : ic.c }}>
                      <Icon name={ic.i as any} size={15} />
                    </div>
                    <div className="tl-body">
                      <div>{ic.label}</div>
                      <div className="tl-time" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {fmtWhen(a)}
                        <span className="badge" style={{ background: isOverdue ? '#FEE2E2' : '#FEF3C7', color: isOverdue ? '#B91C1C' : '#B45309', fontSize: 10 }}>
                          {isOverdue ? 'Atrasado' : 'Agendado'}
                        </span>
                        {canComplete && (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ padding: '2px 10px', fontSize: 11 }}
                            onClick={() => handleCompleteActivity(a)}
                          >
                            <Icon name="Check" size={12} /> Registrar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {dealActivities.length > 0 && pendingActivities.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-2)', marginBottom: 8 }}>
            Histórico
          </div>
        )}
        {dealActivities.length === 0 && pendingActivities.length > 0 ? null : dealActivities.length === 0 ? (
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
              const isStandby = (a as any).cadenceType === 'standby';
              return (
                <div key={a.id ?? i} className="tl-item">
                  <div className="tl-ic" style={{ background: ic.c }}>
                    <Icon name={ic.i as any} size={15} />
                  </div>
                  <div className="tl-body">
                    <div>{a.outcome || (a as any).text || ic.label}</div>
                    <div className="tl-time" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {ic.label} · {who} · {fmtWhen(a)}
                      {isStandby && <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10 }}>⏸ Standby {(a as any).standbyIndex}/{(a as any).standbyTotal}</span>}
                      {a.status === 'skipped' && <span className="badge" style={{ background: 'var(--bg)', color: 'var(--text-2)', fontSize: 10 }}>Pulado</span>}
                      {a.status === 'rescheduled' && <span className="badge" style={{ background: 'var(--bg)', color: 'var(--text-2)', fontSize: 10 }}>Remarcado</span>}
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

  // Jornada completa do lead: criação → BDR → SDR → handoff → Rep → desfecho
  // (Observações do cliente, jul/2026 — visível mesmo após o bastão passado)
  const renderHistory = () => {
    const fmtTs = (raw: any): string => {
      const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) return '';
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    };
    const nameOf = (uid?: string) => (uid ? sellerById(sellers, uid).name : '—');

    const dealHandoffs = handoffs
      .filter(h => h.dealId === deal.id)
      .sort((a, b) => (a.createdAt?.toDate?.()?.getTime?.() ?? 0) - (b.createdAt?.toDate?.()?.getTime?.() ?? 0));

    interface JourneyStep { icon: string; color: string; text: string; time: string; links?: { label: string; url: string }[] }
    const steps: JourneyStep[] = [];

    steps.push({
      icon: 'Sparkles', color: '#6366F1',
      text: deal.bdrId ? `Lead criado por ${nameOf(deal.bdrId)} (BDR)` : `Lead criado por ${nameOf(deal.owner)}`,
      time: fmtTs(deal.createdAt) || 'criação',
    });

    if (deal.leadOrigin) {
      steps.push({ icon: 'Globe', color: '#0369A1', text: `Captado via ${deal.leadOrigin.sourceName}`, time: fmtTs(deal.createdAt) });
    }

    if (deal.assignedSdrId) {
      steps.push({
        icon: 'ListChecks', color: '#B45309',
        text: `Distribuído para ${nameOf(deal.assignedSdrId)} (SDR) trabalhar a cadência`,
        time: fmtTs((deal as any).assignedAt) || 'cadência',
      });
    }

    if (deal.standbyActive) {
      steps.push({
        icon: 'PauseCircle', color: '#92400E',
        text: `Standby ativado — régua de ${deal.standbyFollowUps ?? 5} follow-ups em andamento`,
        time: fmtTs(deal.standbyStartedAt),
      });
    }

    for (const h of dealHandoffs) {
      steps.push({
        icon: 'ArrowRightLeft', color: '#7C3AED',
        text: `Passagem de bastão: ${nameOf(h.fromSdrId)} → ${nameOf(h.toRepId)}`,
        time: fmtTs(h.createdAt),
      });
      if (h.status === 'accepted') {
        steps.push({ icon: 'CheckCircle2', color: '#16A34A', text: `Handoff aceito por ${nameOf(h.toRepId)} (Rep)`, time: fmtTs(h.acceptedAt) });
      } else if (h.status === 'declined') {
        steps.push({ icon: 'XCircle', color: '#B91C1C', text: `Handoff recusado${h.declinedReason ? ` — ${h.declinedReason}` : ''}`, time: fmtTs((h as any).updatedAt) });
      }
    }

    // Projeto de layout: solicitado → em andamento → entregue (A5, PLANO_DESENHO_CRM_2)
    const projectSteps = projectTimelineSteps(timelineEvents);
    for (const p of projectSteps) {
      steps.push({ icon: p.icon, color: p.color, text: p.text, time: fmtTs(p.at), links: p.links });
    }

    if (deal.status === 'won') {
      steps.push({ icon: 'Trophy', color: '#1A6B1A', text: 'Negócio ganho 🏆', time: fmtTs(deal.updatedAt) });
    } else if (deal.status === 'lost') {
      const reasonLabel = getLostReasonLabel(deal.lostReason);
      steps.push({
        icon: 'X', color: '#B91C1C',
        text: `Negócio perdido — ${reasonLabel}${deal.requeuedForBdr ? ' (devolvido ao BDR para nova tentativa)' : ''}`,
        time: fmtTs(deal.updatedAt),
      });
    } else {
      steps.push({ icon: 'ArrowRight', color: '#6366F1', text: `Estágio atual: ${stageName} — com ${s.name}`, time: 'agora' });
    }

    return (
    <div>
      <div className="tl">
        {steps.map((h, i) => (
          <div key={i} className="tl-item">
            <div className="tl-ic" style={{ background: h.color }}>
              <Icon name={h.icon as any} size={14} />
            </div>
            <div className="tl-body">
              <div>{h.text}</div>
              {(h.links?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0' }}>
                  {h.links!.map(l => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm" data-testid="link-entrega">
                      <Icon name="Download" size={12} /> {l.label}
                    </a>
                  ))}
                </div>
              )}
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
  };

  // ── Aba Notas — comunicação SDR ↔ Rep e correções eventuais ───────────────
  // Markdown, edição pelo autor e exclusão (autor ou master) vivem em
  // ./notes/NotesTab — as notas do formato antigo (activities type 'note',
  // inclusive as que o sistema grava sozinho) continuam aparecendo lá.
  const renderNotas = () => (
    <Suspense fallback={<div className="muted notes-empty">Carregando notas...</div>}>
      <NotesTab
        dealId={deal.id}
        productId={deal.productId || 'wizmart'}
        activities={activities}
        sellers={sellers}
        canWrite={canEditDeal}
        onToast={msg => onPoints({ pts: 0, custom: msg })}
      />
    </Suspense>
  );

  // ── JSX principal ─────────────────────────────────────────────────────────

  const panelContent = (
      <div className={`deal-panel ${isPage ? 'deal-page-mode' : ''}`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="deal-hd">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPage && (
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Voltar">
                  <Icon name="ArrowLeft" size={18} />
                </button>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: prodColor + '18', color: prodColor }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: prodColor }} />
                {prodLabel}
              </span>
              <span className="badge badge-primary">{stageName}</span>
            </div>
            {!isPage && (
              <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Fechar painel">
                <Icon name="X" size={18} />
              </button>
            )}
          </div>

          <div className="row" style={{ gap: 8 }}>
            {canEditDeal && (
              <button
                className="icon-btn"
                style={{ width: 32, height: 32, flexShrink: 0 }}
                onClick={toggleFavorite}
                title={deal.isFavorite ? 'Remover dos favoritos' : 'Marcar como lead de grande potencial'}
                aria-label="Favoritar lead"
              >
                <Icon name="Star" size={18} color={deal.isFavorite ? '#F59E0B' : '#C4CBD4'} fill={deal.isFavorite ? '#F59E0B' : 'none'} />
              </button>
            )}
            {!canEditDeal && deal.isFavorite && (
              <Icon name="Star" size={18} color="#F59E0B" fill="#F59E0B" style={{ flexShrink: 0, alignSelf: 'center' }} />
            )}
            {isEditing ? (
              <input
                className="input"
                style={{ flex: 1, fontSize: 15, fontWeight: 700 }}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nome do negócio"
                autoFocus
              />
            ) : (
              <h1 className="h1" style={{ flex: 1, lineHeight: 1.2 }}>{deal.name}</h1>
            )}
            {canEditDeal && !isEditing && (
              <button
                onClick={openEdit}
                aria-label="Editar negócio"
                title="Editar negócio"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
              >
                <Icon name="Pencil" size={15} color="#9aa3af" />
              </button>
            )}
          </div>

          {isEditing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Empresa</div>
                <input className="input" value={editCompany} onChange={e => setEditCompany(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Valor (R$)</div>
                <input className="input" type="number" step="0.01" value={editValue} onChange={e => setEditValue(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <div className="fl">Vencimento</div>
                <input className="input" value={editDue} onChange={e => setEditDue(e.target.value)} placeholder="Ex.: 20/07" />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div className="money" style={{ color: 'var(--primary)', fontSize: 18 }}>
                {fmtCurrency(deal.value)}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{deal.company}</span>
            </div>
          )}

          {/* Origem de captação (WizMart Forms) */}
          {deal.leadOrigin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span
                className="badge"
                title={deal.leadOrigin.pageUrl ? `Página: ${deal.leadOrigin.pageUrl}` : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E0F2FE', color: '#0369A1', fontSize: 11 }}
              >
                <Icon name="Globe" size={11} /> Origem: {deal.leadOrigin.sourceName}
              </span>
              {deal.leadOrigin.utm && Object.entries(deal.leadOrigin.utm).map(([k, v]) => (
                <span key={k} className="badge badge-gray" style={{ fontSize: 10.5 }} title={k}>
                  {k.replace(/^utm/, '').toLowerCase()}: {v}
                </span>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {isEditing ? (
              <>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={savingEdit || !editName.trim() || !editCompany.trim()}>
                  <Icon name="Check" size={14} /> {savingEdit ? 'Salvando...' : 'Salvar'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={savingEdit}>
                  <Icon name="X" size={14} /> Cancelar
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => handleStageChange('won')}>
                  <Icon name="Trophy" size={14} /> Ganhar
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setShowLostReasonModal(true)}>
                  <Icon name="X" size={14} /> Perder
                </button>
                {canEditDeal && (
                  <button className="btn btn-outline btn-sm" onClick={openEdit}>
                    <Icon name="Pencil" size={14} /> Editar
                  </button>
                )}
              </>
            )}
            {canEditDeal && !deal.standbyActive && deal.status === 'open' && (
              <button
                className="btn btn-sm"
                style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B44' }}
                onClick={() => setShowStandbyModal(true)}
                title="Gera a régua obrigatória de follow-ups (mín. 5, até 7 dias entre eles)"
              >
                <Icon name="PauseCircle" size={14} /> Standby
              </button>
            )}
            {canAssignSdr && (
              <button
                className="btn btn-sm"
                style={{ background: '#F3E8FF', color: '#7C3AED', border: '1px solid #E9D5FF' }}
                onClick={() => setShowAssignSdrModal(true)}
                title="Atribui o lead direto a um SDR, sem esperar o motor de cadência das 7h"
              >
                <Icon name="UserPlus" size={14} /> Atribuir SDR
              </button>
            )}
            {canChangeResponsible && (
              <button
                className="btn btn-sm"
                style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}
                onClick={() => setShowChangeResponsibleModal(true)}
                title="Troca o responsável atual do card (BDR, SDR ou Rep, conforme quem está com ele)"
              >
                <Icon name="ArrowRightLeft" size={14} /> Trocar responsável
              </button>
            )}
            {deal.standbyActive && (
              <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B44', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="PauseCircle" size={12} /> Em Standby{deal.standbyFollowUps ? ` (${deal.standbyFollowUps} follow-ups)` : ''}
              </span>
            )}
            {canRequestProject(user, deal) && (
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
            ['notas',       'Notas'],
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
          {tab === 'notas'      && renderNotas()}
          {tab === 'history'    && renderHistory()}
        </div>

      </div>
  );

  return (
    <>
    {isPage ? panelContent : (
      <div className="overlay" onClick={onClose}>
        {panelContent}
      </div>
    )}

    {/* LostReasonModal — motivo estruturado ao marcar como Perdido */}
    {showLostReasonModal && (
      <LostReasonModal
        deal={deal}
        onClose={() => setShowLostReasonModal(false)}
        onConfirm={handleConfirmLost}
      />
    )}

    {/* StandbyModal — régua obrigatória de follow-ups */}
    {showStandbyModal && (
      <StandbyModal
        deal={deal}
        onClose={() => setShowStandbyModal(false)}
        onSuccess={() => onPoints({ pts: 0, custom: '⏸ Standby ativado — follow-ups agendados!' })}
        onError={msg => onPoints({ pts: 0, custom: `⚠️ ${msg}` })}
      />
    )}

    {/* AssignSdrModal — atribuição manual BDR→SDR (Fase D2) */}
    {showAssignSdrModal && (
      <AssignSdrModal
        deal={deal}
        sdrs={activeSdrs}
        workloadBySdr={sdrWorkloads}
        onConfirm={handleAssignSdr}
        onCancel={() => setShowAssignSdrModal(false)}
      />
    )}

    {/* ChangeResponsibleModal — troca de responsável (manage_deal_cards) */}
    {showChangeResponsibleModal && (
      <ChangeResponsibleModal
        deal={deal}
        currentName={computeResponsibleId(deal) ? s.name : 'Sem responsável'}
        candidates={responsibleCandidates}
        onConfirm={handleChangeResponsible}
        onCancel={() => setShowChangeResponsibleModal(false)}
      />
    )}

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
