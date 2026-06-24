/**
 * PipelinePage.tsx — Pipeline Kanban v3 com funis unificados por produto
 *
 * Mudanças v3 vs v2:
 *  - 2 funis unificados (WizMart e Smart Café), cada um com 10 estágios
 *  - Tabs de produto no subbar (WizMart / Smart Café) substituem seletor inbound/outbound/hunter
 *  - Smart Café: ao soltar em "Conectado ao Representante" → abre ConnectionTypeModal
 *  - Client Pequeno (standard_proposal) → drop para Visita Agendada/Realizada bloqueado
 *  - Ao soltar em estágio com `isHandoffRequired` → abre HandoffModal obrigatório
 *  - Badge de porte do cliente (Pequeno/Médio/Grande) nos cards Smart Café
 */

import React, { useState, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { doc, addDoc, collection, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Deal, Funnel, FunnelStage, Seller, SettingUser } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { DealSidebar } from '../deals/DealSidebar';
import { fmtCurrency, sellerById, PRODUCT_COLOR } from '../../utils/crmFormat';
import {
  sortedStages,
  shouldTriggerConvergence,
  shouldRequireHandoff,
  visibleFunnelTypes,
  canMoveDeal,
  type HandoffFormData,
} from '../../utils/funnelUtils';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { HandoffModal } from './HandoffModal';
import { ConnectionTypeModal, type ConnectionTypeFormData } from './ConnectionTypeModal';
import { matchesProductId } from '../../utils/productScope';

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
}

function KCard({ deal, onOpen, dragging, onDragStart, onDragEnd, sellers, stageName }: KCardProps) {
  const s = sellerById(sellers, deal.assignedRepId || deal.assignedSdrId || deal.owner);
  const prodColor = deal.productId ? PRODUCT_COLOR[deal.productId]?.primary : '#1A6B1A';

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
      {deal.status === 'converted' && (
        <span className="badge" style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#F59E0B22', color: '#B45309', border: '1px solid #F59E0B44' }}>
          Convertido
        </span>
      )}
      {deal.clientSize && deal.status !== 'converted' && (
        <span className="badge" style={{
          position: 'absolute', top: 8, right: 8, fontSize: 10,
          background: deal.clientSize === 'small' ? '#FAF2EC' : deal.clientSize === 'medium' ? '#FEF3C7' : '#EFF6FF',
          color: deal.clientSize === 'small' ? '#5E3A26' : deal.clientSize === 'medium' ? '#92400E' : '#1E3A5F',
          border: `1px solid ${deal.clientSize === 'small' ? '#D4A37344' : deal.clientSize === 'medium' ? '#F59E0B44' : '#3B82F644'}`,
        }}>
          {deal.clientSize === 'small' ? 'Pequeno' : deal.clientSize === 'medium' ? 'Médio' : 'Grande'}
        </span>
      )}

      <div className="knm" style={{ paddingRight: (deal.status === 'converted' || deal.clientSize) ? 75 : 0 }}>{deal.name}</div>

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
          <div className="krow" style={{ margin: 0, gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
            <Icon name="Calendar" size={13} />
            <span style={{ fontSize: 11.5 }}>{deal.due}</span>
          </div>
        )}
      </div>

      <div className="kfoot">
        <div className="row" style={{ gap: 6 }}>
          <Av initials={s.initials} color={s.color} size={22} />
          <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 700 }}>
            {s.name.split(' ')[0]}
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
            const s = sellerById(sellers, d.assignedRepId || d.assignedSdrId || d.owner);
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
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const role = user?.role ?? 'viewer';

  // Estado local de UI
  const [view,          setView]          = useState<'kanban' | 'list'>('kanban');
  const [selectedFunnel, setSelectedFunnel] = useState<string>('');
  const [draggedDeal,   setDraggedDeal]   = useState<Deal | null>(null);
  const [activeDrop,    setActiveDrop]    = useState<string | null>(null);
  const [selectedDeal,  setSelectedDeal]  = useState<Deal | null>(null);
  const [showNewDeal,   setShowNewDeal]   = useState(false);
  const [pendingDrop,   setPendingDrop]   = useState<PendingDrop | null>(null);
  const [connectionDrop, setConnectionDrop] = useState<{ deal: Deal; targetStage: FunnelStage } | null>(null);
  const [toasts,        setToasts]        = useState<ToastItem[]>([]);

  // Campos do formulário de Novo Negócio
  const [ndName,    setNdName]   = useState('');
  const [ndCompany, setNdCompany] = useState('');
  const [ndValue,   setNdValue]  = useState('');
  const [ndStage,   setNdStage]  = useState('');
  const [ndDue,     setNdDue]    = useState('');
  const [ndSaving,  setNdSaving] = useState(false);

  // Dados Firestore
  const { data: funnels }  = useFirestoreCollection<Funnel>('funnels');
  const { data: deals }    = useFirestoreCollection<Deal>('deals');
  const { data: sellers }  = useFirestoreCollection<Seller>('sellers');
  const { data: allUsers } = useFirestoreCollection<SettingUser>('users');
  const { updateDocument, addDocument } = useFirestoreMutations('deals');

  // Filtrar funis pelo role e produto
  const allowedTypes = visibleFunnelTypes(role);
  const visibleFunnels = useMemo(
    () => funnels
      .filter(f => f.isActive && allowedTypes.includes(f.type))
      .filter(f => matchesProductId(productScope, f.productId)),
    [funnels, allowedTypes, productScope],
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

  // Filtra deals pelo funil ativo e produto
  const funnelDeals = useMemo(
    () => deals.filter(d => {
      if (activeFunnel && d.funnelId && d.funnelId !== activeFunnel.id) return false;
      if (!matchesProductId(productScope, d.productId || 'wizmart')) return false;
      return true;
    }),
    [deals, activeFunnel, productScope],
  );

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

    const needsHandoff  = shouldRequireHandoff(stage, draggedDeal);
    const willConverge  = shouldTriggerConvergence(draggedDeal, stage, activeFunnel.type);

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

  const commitDrop = async (deal: Deal, stage: FunnelStage) => {
    try {
      // ── v3: cohortKeys automáticos por estágio ────────────────────────────
      const nowMonth = new Date().toISOString().slice(0, 7); // ex: '2026-06'
      const cohortPatch: Record<string, string | number> = {};
      // WizMart: visita_agendada | Smart Café: conectado (quando connectionType é definido)
      const isVisitStage = stage.id === 'visita_agendada' ||
        (stage.id === 'conectado' && activeFunnel?.productId === 'smart_cafe');
      if (isVisitStage && !deal.cohortKeys?.visitScheduledMonth) {
        cohortPatch.visitScheduledMonth = nowMonth;
      }
      // WizMart: inaugurado | Smart Café: instalacao_realizada
      const isWonStage = stage.id === 'inaugurado' || stage.id === 'instalacao_realizada';
      if (isWonStage && !deal.cohortKeys?.conquestMonth) {
        cohortPatch.conquestMonth = nowMonth;
      }
      // prospectsSharedMonth: setado quando BDR transfere para SDR
      if (stage.id === 'prospeccao' && deal.bdrId && deal.assignedSdrId && !deal.cohortKeys?.prospectsSharedMonth) {
        cohortPatch.prospectsSharedMonth = nowMonth;
      }

      const updatePayload: Record<string, any> = { stage: stage.id, updatedAt: new Date() };
      // Estágio terminal "Perdeu" → marca status lost
      if (stage.isLost) {
        updatePayload['status'] = 'lost';
      }
      if (Object.keys(cohortPatch).length > 0) {
        updatePayload['cohortKeys'] = { ...(deal.cohortKeys ?? {}), ...cohortPatch };
      }

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
    } finally {
      setDraggedDeal(null);
      setActiveDrop(null);
    }
  };

  const onHandoffConfirm = async (form: HandoffFormData) => {
    if (!pendingDrop || !user?.tenantId) return;
    const { deal, targetStage, willConverge } = pendingDrop;

    // 1. Mover o deal para o novo estágio
    await updateDocument(deal.id, {
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
    const handoffsCol = collection(db, 'tenants', user.tenantId, 'handoffs');
    await addDoc(handoffsCol, {
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
      const dealsCol = collection(db, 'tenants', user.tenantId, 'deals');
      const hunterDeal = await addDoc(dealsCol, {
        ...deal,
        id: undefined,
        funnelType: 'hunter',
        funnelId: funnels.find(f => f.type === 'hunter' && f.productId === deal.productId)?.id || '',
        stage: 'visita_ag_h',
        status: 'open',
        linkedDealId: deal.id,
        assignedRepId: form.toRepId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Atualizar deal original com referência ao espelho Hunter
      const dealRef = doc(db, 'tenants', user.tenantId, 'deals', deal.id);
      await updateDoc(dealRef, {
        status: 'converted',
        linkedHunterDealId: hunterDeal.id,
        updatedAt: new Date(),
      });

      triggerToast({ pts: 10, label: 'Convergência', custom: '🎯 Deal espelho criado no funil Hunter!' });
    }

    setPendingDrop(null);
  };

  // ── Novo Negócio ─────────────────────────────────────────────────────────────

  const openNewDeal = (stageId?: string) => {
    setNdName(''); setNdCompany(''); setNdValue(''); setNdDue('');
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
        dealData.bdrId = user.uid;
      }
      if (role === 'sdr' && user?.uid) {
        dealData.assignedSdrId = user.uid;
      }

      await addDocument(dealData);
      setShowNewDeal(false);
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
              const dealCount = deals.filter(d =>
                d.funnelId ? d.funnelId === f.id : d.productId === f.productId,
              ).length;
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
          <button className="btn btn-outline btn-sm">
            <Icon name="SlidersHorizontal" size={15} />Filtrar
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
              <div className="h2" style={{ marginBottom: 6 }}>Nenhum negócio neste funil</div>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                {activeFunnel?.type === 'hunter'
                  ? 'Deals aparecem aqui quando um SDR faz handoff via Inbound ou Outbound.'
                  : 'Crie o primeiro negócio para começar a movimentar o pipeline.'}
              </p>
              {canMoveDeal(role) && activeFunnel?.type !== 'hunter' && (
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
                          onOpen={deal => setSelectedDeal(deal)}
                          dragging={draggedDeal?.id === d.id}
                          onDragStart={canMoveDeal(role) ? onDragStart : () => {}}
                          onDragEnd={onDragEnd}
                          sellers={sellers}
                          stageName={st.name}
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
          <DealsTable deals={funnelDeals} onOpen={deal => setSelectedDeal(deal)} sellers={sellers} stages={stages} />
        </div>
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

      {/* DealSidebar */}
      {selectedDeal && (
        <DealSidebar
          dealId={selectedDeal.id}
          onClose={() => setSelectedDeal(null)}
          onPoints={g => triggerToast({ pts: g.pts, label: g.title || g.label || 'Tarefa', custom: g.custom })}
        />
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
