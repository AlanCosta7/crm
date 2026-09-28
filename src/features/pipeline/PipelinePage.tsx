/**
 * PipelinePage.tsx — Pipeline Kanban v3 com funis unificados por produto
 *
 * Mudanças v3 vs v2:
 *  - 2 funis unificados (WizMart e Smart Café), cada um com 10 estágios
 *  - Tabs de produto no subbar (WizMart / Smart Café) substituem seletor inbound/outbound/hunter
 *
 * Fase 1.3 do PLANO_DESENHO_CRM.md — visão única do pipe:
 *  - As tabs viraram UM board por produto (`pipelineBoards`). Antes, cada funil
 *    virava uma aba, o que produzia 4 boards do mesmo WizMart (`BDR - Outbound`,
 *    `Inbound`, `Outbound`, `WizMart`) — o deck pede o contrário: "uma visão
 *    única do Pipe, sem distinção entre Inbound e Outbound".
 *  - A origem não sumiu: virou selo no card e filtro no subbar, lendo
 *    `Deal.origin` (derivado no servidor por `onDealParticipantsChanged`).
 *  - Smart Café: ao soltar em "Conectado ao Representante" → abre ConnectionTypeModal
 *  - Client Pequeno (standard_proposal) → drop para Visita Agendada/Realizada bloqueado
 *  - Ao soltar em estágio com `isHandoffRequired` → abre HandoffModal obrigatório
 *  - Badge de porte do cliente (Pequeno/Médio/Grande) nos cards Smart Café
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import anime from 'animejs';
import { doc, collection, writeBatch, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Deal, Funnel, FunnelStage, Seller, SettingUser } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { fmtCurrency, sellerById, PRODUCT_COLOR, ROLE_LABEL } from '../../utils/crmFormat';
import {
  sortedStages,
  shouldTriggerConvergence,
  shouldRequireHandoff,
  canMoveDeal,
  canConfirmHandoff,
  pipelineBoards,
  dealBelongsToBoard,
  dealOrigin,
  filterDealsByOrigin,
  countByOrigin,
  type HandoffFormData,
} from '../../utils/funnelUtils';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { HandoffModal } from './HandoffModal';
import { ConnectionTypeModal, type ConnectionTypeFormData } from './ConnectionTypeModal';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import { LostReasonModal } from '../deals/LostReasonModal';
import { getLostReasonLabel, requeuesToBdr } from '../../utils/lostReasonUtils';
import type { LostReasonId } from '../../types/crm';
import { matchesProductId } from '../../utils/productScope';
import { computeParticipantIds, computeResponsibleId } from '../../utils/dealParticipants';
import { dealParticipantConstraint } from '../../utils/dealQueryScope';
import { usePermissions } from '../../hooks/usePermissions';
import { mergePeople } from '../../utils/people';
import { getLastActivityAt, isCardExpired } from '../../utils/cardExpirationUtils';

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  pts: number;
  label: string;
  custom?: string;
}

interface PendingDrop {
  deal: Deal;
  targetStage: FunnelStage;
  needsHandoff: boolean;
  willConverge: boolean;
}

// ── TaskDots (tarefas v1) ─────────────────────────────────────────────────────
function TaskDots({ tasks, size = 24 }: { tasks: { e: boolean; w: boolean; m: boolean }; size?: number }) {
  const defs = [{ k: 'e', icon: 'Mail' }, { k: 'w', icon: 'MessageCircle' }, { k: 'm', icon: 'Calendar' }];
  return (
    <div className="ktasks">
      {defs.map(d => {
        const done = tasks[d.k as 'e' | 'w' | 'm'];
        return (
          <div key={d.k} className={`ktask ${done ? 'done' : ''}`} style={{ width: size, height: size }}>
            <Icon name={done ? 'Check' : d.icon} size={13} strokeWidth={2.5} />
          </div>
        );
      })}
    </div>
  );
}

// ── KCard ─────────────────────────────────────────────────────────────────────
interface KCardProps {
  deal: Deal;
  onOpen: (d: Deal) => void;
  dragging: boolean;
  onDragStart: (d: Deal, e: React.DragEvent) => void;
  onDragEnd: () => void;
  sellers: Seller[];
  stageName?: string;
  /** Presente apenas para papéis operacionais — alterna a estrela de favorito */
  onToggleFavorite?: (d: Deal) => void;
  /** 21+ dias sem atividade concluída (Observações do cliente, jul/2026) */
  expired?: boolean;
  /** uid de quem está olhando — usado só pro badge "Repassado" */
  currentUid?: string;
}

function KCard({ deal, onOpen, dragging, onDragStart, onDragEnd, sellers, stageName, onToggleFavorite, expired, currentUid }: KCardProps) {
  // responsibleId é gravado pela CF onDealParticipantsChanged; fallback ao cálculo
  // inline só para o intervalo entre o backfill e a 1ª sincronização de deals antigos.
  const s = sellerById(sellers, deal.responsibleId || deal.assignedRepId || deal.assignedSdrId || deal.owner);
  const prodColor = deal.productId ? PRODUCT_COLOR[deal.productId]?.primary : '#1A6B1A';
  // Card aparece porque quem está olhando participa (assinou em algum momento),
  // mas não é mais quem está com o bastão — evita achar que precisa agir nele.
  const isPassedAlong = !!currentUid && currentUid !== deal.responsibleId
    && (deal.participantIds || []).includes(currentUid);
  const origem = dealOrigin(deal);

  return (
    <div
      className={`kcard ${dragging ? 'dragging' : ''}`}
      draggable
      onClick={() => onOpen(deal)}
      onDragStart={e => onDragStart(deal, e)}
      onDragEnd={onDragEnd}
      id={`kcard-${deal.id}`}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Badge de produto (faixa lateral colorida) */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: prodColor, borderRadius: '4px 0 0 4px' }} />

      {/* Badge de status / porte do cliente */}
      {expired && (
        <span className="badge" title="21+ dias sem atividade concluída" style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
          ⏰ Vencido
        </span>
      )}
      {!expired && deal.status === 'converted' && (
        <span className="badge" style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#F59E0B22', color: '#B45309', border: '1px solid #F59E0B44' }}>
          Convertido
        </span>
      )}
      {!expired && deal.clientSize && deal.status !== 'converted' && (
        <span className="badge" style={{
          position: 'absolute', top: 8, right: 8, fontSize: 10,
          background: deal.clientSize === 'small' ? '#FAF2EC' : deal.clientSize === 'medium' ? '#FEF3C7' : '#EFF6FF',
          color: deal.clientSize === 'small' ? '#5E3A26' : deal.clientSize === 'medium' ? '#92400E' : '#1E3A5F',
          border: `1px solid ${deal.clientSize === 'small' ? '#D4A37344' : deal.clientSize === 'medium' ? '#F59E0B44' : '#3B82F644'}`,
        }}>
          {deal.clientSize === 'small' ? 'Pequeno' : deal.clientSize === 'medium' ? 'Médio' : 'Grande'}
        </span>
      )}

      <div className="knm" style={{ paddingRight: (deal.status === 'converted' || deal.clientSize) ? 75 : 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {(onToggleFavorite || deal.isFavorite) && (
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite?.(deal); }}
            title={onToggleFavorite ? (deal.isFavorite ? 'Remover dos favoritos' : 'Marcar como lead de grande potencial') : 'Lead de grande potencial'}
            aria-label="Favoritar lead"
            style={{ background: 'none', border: 'none', padding: 0, cursor: onToggleFavorite ? 'pointer' : 'default', display: 'inline-flex', flexShrink: 0 }}
          >
            <Icon name="Star" size={13} color={deal.isFavorite ? '#F59E0B' : '#C4CBD4'} fill={deal.isFavorite ? '#F59E0B' : 'none'} />
          </button>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.name}</span>
      </div>

      <div className="krow">
        <Icon name="Building2" size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{deal.company}</span>
      </div>

      {stageName && (
        <div className="krow" style={{ color: 'var(--text-2)', fontSize: 11 }}>
          <Icon name="Layers" size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{stageName}</span>
        </div>
      )}

      <div className="krow" style={{ justifyContent: 'space-between', marginBottom: 0, gap: 10 }}>
        <span className="kval" style={{ flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fmtCurrency(deal.value)}
        </span>
        {deal.due && deal.due !== '—' && deal.due !== '' && (
          <div className="krow" style={{ margin: 0, gap: 4, flexShrink: 1, minWidth: 0, whiteSpace: 'nowrap' }}>
            <Icon name="Calendar" size={13} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.due}</span>
          </div>
        )}
      </div>

      <div className="kfoot">
        <div className="row" style={{ gap: 6, minWidth: 0 }}>
          <Av initials={s.initials} color={s.color} size={22} />
          <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name.split(' ')[0]}
          </span>
          {isPassedAlong && (
            <span
              className="badge"
              title="Você participou deste card, mas não é mais o responsável atual"
              style={{ fontSize: 9.5, height: 16, padding: '0 5px', background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)', flexShrink: 0 }}
            >
              Repassado
            </span>
          )}
          {/* Origem do lead — o que substitui os boards separados de Inbound e
              Outbound (Fase 1.3). Inbound = o cliente levantou a mão num
              formulário nosso; Outbound = prospecção ativa do time. */}
          <span
            className="badge"
            title={origem === 'inbound'
              ? 'Inbound — o cliente preencheu um formulário nosso'
              : 'Outbound — prospecção ativa do time'}
            style={{
              fontSize: 9.5, height: 16, padding: '0 5px', flexShrink: 0,
              background: origem === 'inbound' ? '#EFF6FF' : '#F0F7F0',
              color: origem === 'inbound' ? '#1E40AF' : '#1A6B1A',
              border: `1px solid ${origem === 'inbound' ? '#3B82F644' : '#1A6B1A33'}`,
            }}
          >
            {origem === 'inbound' ? 'In' : 'Out'}
          </span>
        </div>
        {deal.tasks && <TaskDots tasks={deal.tasks} />}
      </div>
    </div>
  );
}

// ── DealsTable ────────────────────────────────────────────────────────────────
interface DealsTableProps {
  deals: Deal[];
  onOpen: (d: Deal) => void;
  sellers: Seller[];
  stages: FunnelStage[];
}

function DealsTable({ deals, onOpen, sellers, stages }: DealsTableProps) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s.name]));
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            {['Negócio', 'Empresa', 'Produto', 'Valor', 'Estágio', 'Vencimento', 'Responsável', 'Tarefas', ''].map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => {
            const s = sellerById(sellers, d.responsibleId || d.assignedRepId || d.assignedSdrId || d.owner);
            const prodColor = d.productId ? PRODUCT_COLOR[d.productId]?.primary : '#1A6B1A';
            return (
              <tr key={d.id} className={i % 2 ? 'alt' : ''}>
                <td>
                  <button onClick={() => onOpen(d)} className="tlink font-semibold">{d.name}</button>
                </td>
                <td className="muted">{d.company}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: prodColor }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: prodColor }} />
                    {d.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart'}
                  </span>
                </td>
                <td className="money">{fmtCurrency(d.value)}</td>
                <td><span className="badge badge-primary">{stageMap[d.stage] || d.stage}</span></td>
                <td className="muted">{d.due}</td>
                <td>
                  <div className="row" style={{ gap: 7 }}>
                    <Av initials={s.initials} color={s.color} size={24} />
                    <span style={{ fontSize: 12.5 }}>{s.name.split(' ')[0]}</span>
                  </div>
                </td>
                <td>{d.tasks && <TaskDots tasks={d.tasks} size={22} />}</td>
                <td>
                  <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => onOpen(d)}>
                    <Icon name="ArrowUpRight" size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── PipelinePage principal ────────────────────────────────────────────────────
export function PipelinePage() {
  const { user }     = useAuthStore();
  const navigate     = useNavigate();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const role = user?.role ?? 'viewer';

  // Estado local de UI
  const [view,          setView]          = useState<'kanban' | 'list'>('kanban');
  const [selectedFunnel, setSelectedFunnel] = useState<string>('');
  // Filtro de origem — substitui a antiga separação por funil (Fase 1.3)
  const [originFilter, setOriginFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [draggedDeal,   setDraggedDeal]   = useState<Deal | null>(null);
  const [activeDrop,    setActiveDrop]    = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  // Filtro "Todos" / "Meus Cards" / colega específico — só relevante pra quem
  // tem leitura restrita a participantes (bdr/sdr/rep); manager/viewer/design
  // já veem tudo e não precisam desse seletor. Valor é 'all', 'mine' ou o uid
  // do colega selecionado.
  const [dealScopeSelection, setDealScopeSelection] = useState<string>('mine');
  const [showNewDeal,   setShowNewDeal]   = useState(false);
  const [pendingDrop,   setPendingDrop]   = useState<PendingDrop | null>(null);
  const [connectionDrop, setConnectionDrop] = useState<{ deal: Deal; targetStage: FunnelStage } | null>(null);
  const [lostReasonDrop, setLostReasonDrop] = useState<{ deal: Deal; targetStage: FunnelStage } | null>(null);
  const [toasts,        setToasts]        = useState<ToastItem[]>([]);

  // Campos do formulário de Novo Negócio
  const [ndName,    setNdName]   = useState('');
  const [ndCompany, setNdCompany] = useState('');
  const [ndValue,   setNdValue]  = useState('');
  const [ndStage,   setNdStage]  = useState('');
  const [ndDue,     setNdDue]    = useState('');
  // Porte estimado (Fase D3) — só o BDR vê esse campo na criação; opcional,
  // default 'M' se deixado em branco (não força o BDR a pesquisar antes de criar).
  const [ndSize,    setNdSize]   = useState<'' | 'P' | 'M' | 'G'>('');
  const [ndSaving,  setNdSaving] = useState(false);
  // Fase 3: mover o card para "Reunião Agendada" pede a data, que é a base da
  // régua de agenda (follow-up 3/3 dias + confirmação 24h úteis antes).
  const [meetingDrop, setMeetingDrop] = useState<{ deal: Deal; targetStage: FunnelStage } | null>(null);

  // Papéis com leitura restrita a participantes (bate com canSeeAllDeals nas
  // rules) — só eles precisam do toggle "Meus Cards / Cards de Outro Ator".
  const showDealScopeToggle = !['master', 'manager', 'viewer', 'design'].includes(role);
  // Quem tem `manage_deal_cards` (BDR por padrão) lê todos os cards: sem filtro de participante.
  const canManageDeals = usePermissions().hasPermission('manage_deal_cards');

  const dealScopeTargetUid = dealScopeSelection === 'all' ? '' : dealScopeSelection === 'mine' ? (user?.uid || '') : dealScopeSelection;
  const dealScopeConstraints = useMemo(() => {
    const base = dealParticipantConstraint(user, canManageDeals);
    if (!showDealScopeToggle || !dealScopeTargetUid) return base;
    return [...base, where('responsibleId', '==', dealScopeTargetUid)];
  }, [user, canManageDeals, showDealScopeToggle, dealScopeTargetUid]);
  // Firestore constraints são recriados a cada render — o hook só reassina
  // quando `queryConstraints.length` muda, então o alvo (all → sem filtro,
  // mine → uid X, colega → uid Y) precisa dessa chave separada pra forçar a
  // reassinatura.
  const dealScopeKey = `${dealScopeSelection}:${dealScopeTargetUid}`;

  // Dados Firestore
  const { data: funnels }  = useFirestoreCollection<Funnel>('funnels');
  const { data: deals }    = useFirestoreCollection<Deal>('deals', dealScopeConstraints, dealScopeKey);
  // Conjunto estável (sem filtro de responsibleId) só pra montar a lista de
  // colegas do seletor "Cards de Outro Ator" — se usasse `deals` acima, a
  // lista encolheria pra só quem já está selecionado no filtro atual.
  const { data: baseScopedDeals } = useFirestoreCollection<Deal>(
    'deals',
    showDealScopeToggle ? dealParticipantConstraint(user, canManageDeals) : [],
  );
  const { data: legacySellers } = useFirestoreCollection<Seller>('sellers');
  const { data: allUsers } = useFirestoreCollection<SettingUser>('users');
  // Nomes/avatares: `users` primeiro (todo convidado só existe lá), `sellers` legado como reserva.
  const sellers = useMemo(() => mergePeople(allUsers, legacySellers), [allUsers, legacySellers]);
  const { data: activities } = useFirestoreCollection<any>('activities');
  const { updateDocument, addDocument } = useFirestoreMutations('deals');
  const { addDocument: addActivity } = useFirestoreMutations('activities');

  // Colegas com quem o usuário já dividiu algum card — única fonte do
  // seletor "Cards de Outro Ator" (decisão confirmada: nunca lista o time
  // inteiro, só quem já cruzou com ele em algum negócio).
  const colleagueOptions = useMemo(() => {
    if (!showDealScopeToggle || !user?.uid) return [] as SettingUser[];
    const ids = new Set<string>();
    baseScopedDeals.forEach(d => (d.participantIds || []).forEach(pid => {
      if (pid && pid !== user.uid) ids.add(pid);
    }));
    return [...ids]
      .map(id => allUsers.find(u => u.id === id))
      .filter((u): u is SettingUser => Boolean(u))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [baseScopedDeals, allUsers, user, showDealScopeToggle]);

  // Um board por produto — o funil unificado ('main') absorve os legados do
  // mesmo produto (Fase 1.3). Sem funil unificado, cai nos legados.
  const visibleFunnels = useMemo(
    () => pipelineBoards(funnels, role, pid => matchesProductId(productScope, pid)),
    [funnels, role, productScope],
  );

  // Seleciona o primeiro funil disponível ao carregar
  useEffect(() => {
    if (visibleFunnels.length > 0 && !selectedFunnel) {
      setSelectedFunnel(visibleFunnels[0].id);
    } else if (selectedFunnel && !visibleFunnels.some(f => f.id === selectedFunnel)) {
      setSelectedFunnel(visibleFunnels[0]?.id || '');
    }
  }, [visibleFunnels, selectedFunnel]);

  const activeFunnel = visibleFunnels.find(f => f.id === selectedFunnel);
  const stages = activeFunnel ? sortedStages(activeFunnel) : [];

  // Deals do board ativo. `dealBelongsToBoard` é o que traz para o board único
  // os cards ainda presos em funis legados — sem precisar migrar o documento.
  const boardDeals = useMemo(
    () => deals.filter(d => {
      if (!dealBelongsToBoard(d, activeFunnel)) return false;
      if (!matchesProductId(productScope, d.productId || 'wizmart')) return false;
      if (onlyFavorites && !d.isFavorite) return false;
      return true;
    }),
    [deals, activeFunnel, productScope, onlyFavorites],
  );

  // Quebra por origem do board inteiro — alimenta os contadores do filtro.
  const originCounts = useMemo(() => countByOrigin(boardDeals), [boardDeals]);

  const funnelDeals = useMemo(
    () => filterDealsByOrigin(boardDeals, originFilter),
    [boardDeals, originFilter],
  );

  const toggleFavorite = async (deal: Deal) => {
    try {
      await updateDocument(deal.id, { isFavorite: !deal.isFavorite, updatedAt: new Date() });
    } catch (err) {
      console.error('[PipelinePage] Erro ao favoritar deal:', err);
      triggerToast({ pts: 0, label: 'Erro', custom: '⚠️ Não foi possível atualizar o favorito.' });
    }
  };

  // Vencimento do card (Observações do cliente, jul/2026): 21 dias sem
  // atividade concluída. Calculado uma vez para todos os deals visíveis.
  const expiredDealIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of funnelDeals) {
      const lastActivityAt = getLastActivityAt(activities, d.id);
      if (isCardExpired(d, lastActivityAt)) ids.add(d.id);
    }
    return ids;
  }, [funnelDeals, activities]);

  const colDeals  = (sid: string) => funnelDeals.filter(d => d.stage === sid);
  const colTotal  = (sid: string) => colDeals(sid).reduce((a, d) => a + d.value, 0);
  const reps = allUsers.filter(u => u.role === 'rep' || u.role === 'master' || u.role === 'manager');

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const onDragStart = (deal: Deal, e: React.DragEvent) => {
    if (!canMoveDeal(role)) return;
    setDraggedDeal(deal);
    e.dataTransfer.setData('text/plain', deal.id);
  };

  const onDragEnd = () => { setDraggedDeal(null); setActiveDrop(null); };

  const onDrop = (stage: FunnelStage) => {
    if (!draggedDeal || !activeFunnel) return;

    // ── v3: Smart Café "Conectado ao Representante" requer seleção de subtipo ──
    if (stage.hasConnectionSubtype && activeFunnel.productId === 'smart_cafe' && !draggedDeal.connectionType) {
      setConnectionDrop({ deal: draggedDeal, targetStage: stage });
      setDraggedDeal(null);
      setActiveDrop(null);
      return;
    }

    // ── Fase 3: "Reunião Agendada" exige a data do compromisso ──────────────
    // Sem data a Cloud Function não tem como montar a régua de agenda, então o
    // card não entra na etapa "no escuro".
    if (stage.id === 'reuniao_agendada' && !draggedDeal.meetingScheduledAt) {
      setMeetingDrop({ deal: draggedDeal, targetStage: stage });
      setDraggedDeal(null);
      setActiveDrop(null);
      return;
    }

    // Estágio terminal "Perdeu" exige motivo estruturado (Observações do
    // cliente, jul/2026) — nunca marca perda sem passar pelo modal.
    if (stage.isLost) {
      setLostReasonDrop({ deal: draggedDeal, targetStage: stage });
      setDraggedDeal(null);
      setActiveDrop(null);
      return;
    }

    const needsHandoff  = shouldRequireHandoff(stage, draggedDeal);
    const willConverge  = shouldTriggerConvergence(draggedDeal, stage, activeFunnel.type);

    // Passagem de bastão é exclusiva de SDR/gestão (mesma regra das security rules).
    // BDR passa leads para o SDR, não para o Rep.
    if (needsHandoff && !canConfirmHandoff(role)) {
      triggerToast({ pts: 0, label: 'Sem permissão', custom: '🚫 A passagem de bastão é feita pelo SDR responsável (ou gestão).' });
      setDraggedDeal(null);
      setActiveDrop(null);
      return;
    }

    if (needsHandoff || willConverge) {
      // Guarda o drop pendente e aguarda confirmação (HandoffModal ou confirm)
      setPendingDrop({ deal: draggedDeal, targetStage: stage, needsHandoff, willConverge });
      setDraggedDeal(null);
      setActiveDrop(null);
      return;
    }

    commitDrop(draggedDeal, stage);
  };

  const onConnectionTypeConfirm = async (data: ConnectionTypeFormData) => {
    if (!connectionDrop) return;
    const { deal, targetStage } = connectionDrop;
    try {
      await updateDocument(deal.id, {
        stage: targetStage.id,
        clientSize: data.clientSize,
        connectionType: data.connectionType,
        updatedAt: new Date(),
      });
      triggerToast({ pts: targetStage.coinsOnEnter * 10, label: 'Conexão registrada!', custom: `✅ ${deal.name} → ${targetStage.name}` });
    } catch (err) {
      console.error('[PipelinePage] Erro ao confirmar conexão:', err);
    } finally {
      setConnectionDrop(null);
    }
  };

  const onLostReasonConfirm = async (reasonId: LostReasonId, note: string) => {
    if (!lostReasonDrop || !user?.uid) return;
    const { deal, targetStage } = lostReasonDrop;
    const requeue = requeuesToBdr(reasonId);

    const patch: Record<string, any> = {
      stage: targetStage.id,
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
      productId: deal.productId || activeFunnel?.productId || 'wizmart',
    });

    triggerToast({ pts: 0, label: 'Negócio perdido', custom: requeue ? `↩️ ${deal.name} devolvido ao BDR` : `❌ ${deal.name} marcado como perdido` });
    setLostReasonDrop(null);
  };

  const commitDrop = async (deal: Deal, stage: FunnelStage) => {
    try {
      // cohortKeys são gravados EXCLUSIVAMENTE pela Cloud Function onDealStageChanged
      // (as security rules negam a escrita de cohortKeys pelo cliente — escrever aqui
      // fazia o move inteiro ser rejeitado com permission-denied).
      // Estágios "Perdeu" nunca chegam aqui — são interceptados em onDrop
      // e exigem o LostReasonModal (motivo estruturado obrigatório).
      const updatePayload: Record<string, any> = { stage: stage.id, updatedAt: new Date() };

      await updateDocument(deal.id, updatePayload);

      setTimeout(() => {
        anime({ targets: `#kcard-${deal.id}`, scale: [0.93, 1.04, 1], rotate: [2, -1, 0], duration: 600, easing: 'easeOutElastic(1, .6)' });
      }, 50);
      anime({ targets: `#kcol-hd-${stage.id}`, scale: [1, 1.04, 1], duration: 350, easing: 'easeInOutQuad' });

      // Premiação de moedas ao entrar em estágio configurado
      if (stage.coinsOnEnter > 0) {
        triggerToast({ pts: stage.coinsOnEnter * 10, label: `Entrou em ${stage.name}`, custom: `+${stage.coinsOnEnter} moeda${stage.coinsOnEnter > 1 ? 's' : ''} — ${stage.name}!` });
      }
    } catch (err) {
      console.error('[PipelinePage] Erro ao mover deal:', err);
      triggerToast({ pts: 0, label: 'Erro ao mover', custom: `⚠️ Não foi possível mover "${deal.name}". Tente novamente ou contate o suporte.` });
    } finally {
      setDraggedDeal(null);
      setActiveDrop(null);
    }
  };

  const onHandoffConfirm = async (form: HandoffFormData) => {
    if (!pendingDrop || !user?.tenantId) return;
    const { deal, targetStage, willConverge } = pendingDrop;

    // Batch atômico: ou o deal move E o handoff é criado, ou nada acontece.
    // (Antes eram 2 escritas separadas — se a 2ª falhasse, o deal ficava
    // meio migrado, com handoffStatus 'pending' e nenhum handoff para o Rep.)
    const batch = writeBatch(db);
    const dealRef = doc(db, 'tenants', user.tenantId, 'deals', deal.id);
    const handoffRef = doc(collection(db, 'tenants', user.tenantId, 'handoffs'));

    // 1. Mover o deal para o novo estágio
    batch.update(dealRef, {
      stage: targetStage.id,
      handoffStatus: 'pending',
      priorityChannel: form.priorityChannel,
      visitType: form.visitType,
      visitScheduledAt: new Date(form.visitScheduledAt),
      assignedRepId: form.toRepId,
      handoffNotes: form.notes,
      updatedAt: new Date(),
    });

    // 2. Criar documento de handoff na coleção
    batch.set(handoffRef, {
      dealId: deal.id,
      productId: deal.productId || activeFunnel?.productId || 'wizmart',
      fromSdrId: user.uid,
      toRepId: form.toRepId,
      priorityChannel: form.priorityChannel,
      visitType: form.visitType,
      visitScheduledAt: new Date(form.visitScheduledAt),
      notes: form.notes,
      status: 'pending_rep_acceptance',
      createdAt: new Date(),
    });

    // 3. Se convergência, marcar deal original e criar espelho no Hunter
    if (willConverge) {
      // `id` não pode ir no payload (o SDK rejeita valores undefined)
      const { id: _dealId, ...dealData } = deal;
      const hunterRef = doc(collection(db, 'tenants', user.tenantId, 'deals'));
      batch.set(hunterRef, {
        ...dealData,
        funnelType: 'hunter',
        funnelId: funnels.find(f => f.type === 'hunter' && f.productId === deal.productId)?.id || '',
        stage: 'visita_ag_h',
        status: 'open',
        linkedDealId: deal.id,
        assignedRepId: form.toRepId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      batch.update(dealRef, {
        status: 'converted',
        linkedHunterDealId: hunterRef.id,
        updatedAt: new Date(),
      });
    }

    // Erros propagam para o HandoffModal, que exibe a mensagem ao usuário.
    await batch.commit();

    if (willConverge) {
      triggerToast({ pts: 10, label: 'Convergência', custom: '🎯 Deal espelho criado no funil Hunter!' });
    }
    triggerToast({ pts: 0, label: 'Handoff enviado', custom: `🤝 ${deal.name} aguardando aceite do representante.` });

    setPendingDrop(null);
  };

  // ── Novo Negócio ─────────────────────────────────────────────────────────────

  const openNewDeal = (stageId?: string) => {
    setNdName(''); setNdCompany(''); setNdValue(''); setNdDue(''); setNdSize('');
    setNdStage(stageId || stages[0]?.id || '');
    setShowNewDeal(true);
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ndName || !ndCompany || !activeFunnel) return;
    setNdSaving(true);
    try {
      const dealData: any = {
        name: ndName,
        company: ndCompany,
        value: parseFloat(ndValue) || 0,
        stage: ndStage || stages[0]?.id || '',
        funnelId: activeFunnel.id,
        funnelType: activeFunnel.type,
        productId: activeFunnel.productId,
        owner: user?.uid || '',
        due: ndDue || '—',
        status: 'open',
        tasks: { e: false, w: false, m: false },
      };

      if (role === 'bdr' && user?.uid) {
        // A atividade do BDR vai primeiro para o SDR (Observações do cliente,
        // jul/2026): o lead entra na fila do BDR (status 'in_queue') e fica lá
        // até o BDR (ou a gestão) atribuí-lo manualmente a um SDR — não há
        // distribuição automática.
        dealData.bdrId = user.uid;
        dealData.status = 'in_queue';
        // Porte estimado (Fase D3) — opcional; sem seleção, fica sem o campo
        // (efetivamente 'M' pra fins de cálculo, sem fingir uma classificação real).
        if (ndSize) dealData.companySizeEstimate = ndSize;
      }
      if (role === 'sdr' && user?.uid) {
        dealData.assignedSdrId = user.uid;
      }

      dealData.participantIds = computeParticipantIds(dealData);
      dealData.responsibleId = computeResponsibleId(dealData);

      await addDocument(dealData);
      setShowNewDeal(false);
      if (role === 'bdr') {
        triggerToast({ pts: 0, label: 'Lead na fila', custom: '📥 Lead criado — atribua a um SDR para iniciar a cadência.' });
      }
    } catch (err) {
      console.error('[PipelinePage] Erro ao criar deal:', err);
    } finally {
      setNdSaving(false);
    }
  };

  // ── Toasts ────────────────────────────────────────────────────────────────────
  const triggerToast = (g: { pts: number; label: string; custom?: string }) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts(p => [...p, { id, ...g }]);
    setTimeout(() => {
      const el = document.getElementById(`toast-${id}`);
      const bar = document.getElementById(`tbar-${id}`);
      if (el && bar) {
        anime.timeline({ easing: 'easeOutElastic(1, .8)' })
          .add({ targets: el, translateX: [220, 0], opacity: [0, 1], duration: 650 })
          .add({ targets: bar, scaleX: [1, 0], duration: 2500, easing: 'linear', changeBegin: () => { bar.style.transformOrigin = 'left'; } });
      }
    }, 20);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  };

  // ── Skeleton ─────────────────────────────────────────────────────────────────
  if (visibleFunnels.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad" style={{ textAlign: 'center', maxWidth: 400 }}>
          <Icon name="Workflow" size={40} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Nenhum funil configurado</div>
          <p className="muted" style={{ fontSize: 13 }}>Acesse Configurações → Pipelines para criar os funis WizMart e Smart Café.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Subbar */}
      <div className="subbar" style={{ overflow: 'hidden' }}>
        {/* Tabs de produto — scrollável */}
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
            {visibleFunnels.map(f => {
              const isActive = selectedFunnel === f.id;
              const icon = f.productId === 'smart_cafe' ? 'Coffee' : 'ShoppingBag';
              const productLabel = f.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart';
              const funnelLabel = f.name?.trim() || productLabel;
              // Mesmo critério do board ativo — senão a aba mostra um número e
              // o Kanban outro (o board unificado absorve os funis legados).
              const dealCount = deals.filter(d => dealBelongsToBoard(d, f)).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedFunnel(f.id)}
                  className="btn btn-sm"
                  style={{
                    background: isActive ? f.color : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-2)',
                    border: `1.5px solid ${isActive ? f.color : 'var(--border)'}`,
                    fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={icon as any} size={13} />
                  {funnelLabel}
                  <span className="badge" style={{ marginLeft: 4, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-2)', color: isActive ? '#fff' : 'var(--text-2)', fontSize: 11, height: 18, padding: '0 5px' }}>
                    {dealCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controles — fixos à direita */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Origem (Fase 1.3): o pipe é único e a origem é um filtro, não um
              board separado. Os contadores mostram a quebra do board inteiro,
              não da seleção atual — é o que o slide 2 pede. */}
          <div className="seg" title="Origem do lead — Inbound veio de formulário nosso, Outbound é prospecção do time">
            <button
              className={originFilter === 'all' ? 'on' : ''}
              onClick={() => setOriginFilter('all')}
            >
              Todas {originCounts.total > 0 && `(${originCounts.total})`}
            </button>
            <button
              className={originFilter === 'inbound' ? 'on' : ''}
              onClick={() => setOriginFilter('inbound')}
            >
              Inbound {originCounts.inbound > 0 && `(${originCounts.inbound})`}
            </button>
            <button
              className={originFilter === 'outbound' ? 'on' : ''}
              onClick={() => setOriginFilter('outbound')}
            >
              Outbound {originCounts.outbound > 0 && `(${originCounts.outbound})`}
            </button>
          </div>
          {showDealScopeToggle && (
            <select
              className="input"
              style={{ width: 200 }}
              value={dealScopeSelection}
              onChange={e => setDealScopeSelection(e.target.value)}
              title="Cards em que você é o responsável, ou de outra pessoa com quem já dividiu um card"
            >
              <option value="all">Todos</option>
              <option value="mine">Meus Cards</option>
              {colleagueOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name} — {ROLE_LABEL[u.role] || u.role}</option>
              ))}
            </select>
          )}
          <button
            className={`btn btn-sm ${onlyFavorites ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setOnlyFavorites(v => !v)}
            title="Mostrar apenas leads de grande potencial"
          >
            <Icon name="Star" size={15} fill={onlyFavorites ? '#fff' : 'none'} />Favoritos
          </button>
          <div className="seg">
            <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>Kanban</button>
            <button className={view === 'list'   ? 'on' : ''} onClick={() => setView('list')}>Lista</button>
          </div>
          {canMoveDeal(role) && (
            <button className="btn btn-primary btn-sm" onClick={() => openNewDeal()}>
              <Icon name="Plus" size={15} />Novo Negócio
            </button>
          )}
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' ? (
        funnelDeals.length === 0 && stages.length > 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card card-pad" style={{ textAlign: 'center', maxWidth: 440 }}>
              <Icon name="ShoppingCart" size={40} color="var(--accent)" style={{ margin: '0 auto 14px' }} />
              <div className="h2" style={{ marginBottom: 6 }}>
                {originFilter !== 'all'
                  ? `Nenhum negócio ${originFilter === 'inbound' ? 'Inbound' : 'Outbound'} neste pipe`
                  : 'Nenhum negócio neste funil'}
              </div>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                {originFilter !== 'all'
                  ? `O pipe tem ${originCounts.total} negócio(s), mas nenhum desta origem. Volte para "Todas" para ver todos.`
                  : activeFunnel?.type === 'hunter'
                    ? 'Deals aparecem aqui quando um SDR faz handoff via Inbound ou Outbound.'
                    : 'Crie o primeiro negócio para começar a movimentar o pipeline.'}
              </p>
              {originFilter !== 'all' && (
                <button className="btn btn-outline" style={{ margin: '0 auto 10px' }} onClick={() => setOriginFilter('all')}>
                  <Icon name="X" size={15} />Limpar filtro de origem
                </button>
              )}
              {originFilter === 'all' && canMoveDeal(role) && activeFunnel?.type !== 'hunter' && (
                <button className="btn btn-primary" style={{ margin: '0 auto' }} onClick={() => openNewDeal()}>
                  <Icon name="Plus" size={16} />Criar primeiro negócio
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, padding: '16px 20px' }}>
            <div className="kanban">
              {stages.map(st => (
                <div
                  key={st.id}
                  className={`kcol ${activeDrop === st.id ? 'drop' : ''}`}
                  onDragOver={e => { e.preventDefault(); setActiveDrop(st.id); }}
                  onDragLeave={() => setActiveDrop(p => p === st.id ? null : p)}
                  onDrop={() => onDrop(st)}
                >
                  <div className="kcol-hd" id={`kcol-hd-${st.id}`}
                    style={st.isLost ? { background: 'rgba(185,28,28,0.06)', borderBottom: '2px solid #B91C1C22' } : undefined}
                  >
                    <div className="top">
                      <span className="nm" style={st.isLost ? { color: '#B91C1C' } : undefined}>{st.name}</span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {st.isConvergencePoint && <span title="Ponto de convergência — cria deal no Hunter" style={{ fontSize: 12 }}>⚡</span>}
                        {st.isHandoffRequired  && <span title="Handoff obrigatório" style={{ fontSize: 12 }}>🤝</span>}
                        {st.isLost && <span title="Estágio de perda" style={{ fontSize: 12 }}>✗</span>}
                        <span className={st.isLost ? 'badge' : 'badge badge-primary'} style={st.isLost ? { background: '#FEE2E2', color: '#B91C1C' } : undefined}>
                          {colDeals(st.id).length}
                        </span>
                      </div>
                    </div>
                    {!st.isLost && <div className="total">{fmtCurrency(colTotal(st.id))}</div>}
                    {st.slaBusinessDays > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
                        SLA: {st.slaBusinessDays} dias úteis
                      </div>
                    )}
                  </div>

                  <div className="kcol-body">
                    {colDeals(st.id).length === 0 ? (
                      <div style={{ padding: '24px 8px', textAlign: 'center', border: '1.5px dashed var(--border)', borderRadius: 8, opacity: 0.7, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <Icon name="Plus" size={16} color="var(--text-2)" />
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Arraste aqui</div>
                      </div>
                    ) : (
                      colDeals(st.id).map(d => (
                        <KCard
                          key={d.id}
                          deal={d}
                          onOpen={deal => navigate(`/lead/${deal.id}`)}
                          dragging={draggedDeal?.id === d.id}
                          onDragStart={canMoveDeal(role) ? onDragStart : () => {}}
                          onDragEnd={onDragEnd}
                          sellers={sellers}
                          stageName={st.name}
                          onToggleFavorite={canMoveDeal(role) ? toggleFavorite : undefined}
                          expired={expiredDealIds.has(d.id)}
                          currentUid={user?.uid}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
          <DealsTable deals={funnelDeals} onOpen={deal => navigate(`/lead/${deal.id}`)} sellers={sellers} stages={stages} />
        </div>
      )}

      {/* Fase 3 — data da reunião antes de entrar na etapa */}
      {meetingDrop && (
        <ScheduleMeetingModal
          deal={meetingDrop.deal}
          onCancel={() => setMeetingDrop(null)}
          onConfirm={async (quando) => {
            const { deal, targetStage } = meetingDrop;
            setMeetingDrop(null);
            try {
              // A data vai junto com o move: a CF onDealStageChanged lê o deal
              // já atualizado e monta a régua na mesma transição.
              await updateDocument(deal.id, { meetingScheduledAt: quando, updatedAt: new Date() });
              commitDrop({ ...deal, meetingScheduledAt: quando }, targetStage);
            } catch (err) {
              console.error('[PipelinePage] Erro ao agendar a reunião:', err);
              triggerToast({ pts: 0, label: 'Erro', custom: '⚠️ Não foi possível agendar a reunião.' });
            }
          }}
        />
      )}

      {/* Alerta de Convergência (sem handoff) */}
      {pendingDrop && !pendingDrop.needsHandoff && pendingDrop.willConverge && (
        <div className="modal-ov" onClick={() => setPendingDrop(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15 }}>Confirmar Convergência</h3>
              <button className="icon-btn" onClick={() => setPendingDrop(null)}><Icon name="X" size={18} /></button>
            </div>
            <div className="modal-bd">
              <div style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 20 }}>⚡</span>
                </div>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Este estágio é um ponto de convergência.</p>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Um deal espelho será criado automaticamente no funil <strong>Hunter</strong> para "{pendingDrop.deal.name}".
                    O deal original ficará marcado como "Convertido".
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={() => setPendingDrop(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { commitDrop(pendingDrop.deal, pendingDrop.targetStage); setPendingDrop(null); }}>
                <Icon name="Zap" size={15} />Confirmar e criar no Hunter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LostReasonModal — motivo estruturado ao soltar em estágio "Perdeu" */}
      {lostReasonDrop && (
        <LostReasonModal
          deal={lostReasonDrop.deal}
          onClose={() => setLostReasonDrop(null)}
          onConfirm={onLostReasonConfirm}
        />
      )}

      {/* HandoffModal — exibido quando o estágio exige handoff */}
      {pendingDrop?.needsHandoff && (
        <HandoffModal
          deal={pendingDrop.deal}
          reps={reps}
          onConfirm={onHandoffConfirm}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {/* ConnectionTypeModal — Smart Café "Conectado ao Representante" */}
      {connectionDrop && (
        <ConnectionTypeModal
          deal={connectionDrop.deal}
          onConfirm={onConnectionTypeConfirm}
          onCancel={() => setConnectionDrop(null)}
        />
      )}

      {/* Modal Novo Negócio */}
      {showNewDeal && (
        <div className="modal-ov" onClick={() => setShowNewDeal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Novo Negócio — {activeFunnel?.name}</h3>
              <button className="icon-btn" onClick={() => setShowNewDeal(false)}><Icon name="X" size={18} /></button>
            </div>
            <form onSubmit={handleCreateDeal}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Nome do negócio *</div>
                  <input className="input" required value={ndName} onChange={e => setNdName(e.target.value)} placeholder="Ex: Renovação contrato 2026" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Empresa *</div>
                  <input className="input" required value={ndCompany} onChange={e => setNdCompany(e.target.value)} placeholder="Razão social ou nome fantasia" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Valor (R$)</div>
                    <input className="input" type="number" min="0" step="100" value={ndValue} onChange={e => setNdValue(e.target.value)} placeholder="0" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Vencimento</div>
                    <input className="input" type="date" value={ndDue} onChange={e => setNdDue(e.target.value)} />
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Estágio inicial</div>
                  <select className="input" value={ndStage} onChange={e => setNdStage(e.target.value)}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {role === 'bdr' && (
                  <div className="field" style={{ margin: 0 }}>
                    <div className="fl">Porte estimado da empresa</div>
                    <select className="input" value={ndSize} onChange={e => setNdSize(e.target.value as typeof ndSize)}>
                      <option value="">Não sei ainda</option>
                      <option value="P">Pequeno</option>
                      <option value="M">Médio</option>
                      <option value="G">Grande</option>
                    </select>
                    <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Chute inicial pra ajudar a distribuir os leads de forma equilibrada entre os SDRs. O SDR pode corrigir depois de pesquisar.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewDeal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={ndSaving}>
                  <Icon name="Plus" size={16} />
                  {ndSaving ? 'Salvando...' : 'Criar Negócio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} id={`toast-${t.id}`} className="toast" style={{ background: 'var(--primary)', opacity: 0, transform: 'translateX(60px)' }}>
            <div className="tmsg">
              <Icon name="Zap" size={18} color="#FFE08A" />
              <span>{t.custom || `+${t.pts} pts — ${t.label} registrado!`}</span>
            </div>
            <div id={`tbar-${t.id}`} className="tbar" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PipelinePage;
