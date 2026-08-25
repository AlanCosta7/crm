/**
 * DashboardPage.tsx — Painel principal adaptativo por role
 *
 * Renderiza um painel diferente para cada role:
 *   master / manager → 6 KPIs da diretoria + mapa de visitas + negócios prioritários
 *   sdr              → Taxa de conclusão da cadência + deals da fila
 *   rep              → Handoffs pendentes + atividades de follow-up
 *   bdr              → Leads criados + fila SDR
 *   viewer           → Visão somente leitura dos KPIs globais
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import anime from 'animejs';

import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Deal, Activity, Seller, Stage, Handoff, UserGoal } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { sellerById, stageById, completionRate } from '../../utils/crmFormat';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';
import { BrazilMapSVG } from '../../components/ui/BrazilMapSVG';
import { LeadFunnelWidget } from './LeadFunnelWidget';
import { classifyDueActivities } from '../../utils/cadenceUtils';
import { getLostReasonLabel } from '../../utils/lostReasonUtils';
import { isCardExpired, getLastActivityAt } from '../../utils/cardExpirationUtils';
import { dealParticipantConstraint } from '../../utils/dealQueryScope';
import { getSdrWorkload } from '../../utils/sdrWorkload';
import { AssignSdrModal } from '../pipeline/AssignSdrModal';

// ── Período ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month';
const PERIOD_LABELS: Record<Period, string> = { today: 'Hoje', week: 'Esta semana', month: 'Este mês' };



// ── Painel Master / Manager ───────────────────────────────────────────────────
// ── ActivityGoalBar ───────────────────────────────────────────────────────────
function ActivityGoalBar({ actual, goal }: { actual: number; goal: number }) {
  const pct = goal > 0 ? Math.min(Math.round((actual / goal) * 100), 100) : 0;
  const color = pct >= 75 ? '#1A6B1A' : pct >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
        <span>Meta: <strong style={{ color: 'var(--text-1)' }}>{goal}</strong></span>
        <span>Realizado: <strong style={{ color }}>{actual}</strong></span>
      </div>
      {/* trilha da meta */}
      <div style={{ height: 8, borderRadius: 6, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden' }}>
        {/* barra realizado */}
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pct + '%', background: color, borderRadius: 6, transition: 'width 1s ease' }} />
      </div>
      <div style={{ fontSize: 11, color, fontWeight: 600 }}>{pct}% da meta</div>
    </div>
  );
}


// ── PainelGestao ──────────────────────────────────────────────────────────────
function PainelGestao() {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const ui        = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const todayLabel   = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  const [period, setPeriod]           = useState<Period>('month');
  const [showVisitMap, setShowVisitMap] = useState(false);
  const [productFilter, setProductFilter] = useState<'all' | 'wizmart' | 'smart_cafe'>('all');

  const { data: deals }      = useFirestoreCollection<Deal>('deals');
  const { data: activities } = useFirestoreCollection<Activity>('activities');
  const { data: sellers }    = useFirestoreCollection<Seller>('sellers');
  const { data: stages }     = useFirestoreCollection<Stage>('stages');
  const { data: goals }      = useFirestoreCollection<UserGoal>('user_goals');
  const { data: users }      = useFirestoreCollection<any>('users');

  // ── Filtros base (productScope do tenant + filtro local do dashboard) ─────
  const effectiveProduct = productFilter !== 'all' ? productFilter : productScope;
  const scopedDeals = deals.filter(d => matchesProductId(effectiveProduct, d.productId || 'wizmart'));
  const scopedActs  = activities.filter(a => matchesProductId(effectiveProduct, (a as any).productId || 'wizmart'));

  // ── KPI 1 — Prospects Compartilhados ───────────────────────────────────────
  const prospectsShared = scopedDeals.filter(d => d.bdrId && d.assignedSdrId).length;

  // ── KPI 2 — Atividades Meta vs. Realizado ─────────────────────────────────
  // Meta dinâmica: cards em cadência × 4 atividades (email + LinkedIn + ligação + WhatsApp)
  // Admin pode sobrescrever via user_goals.activitiesPerDay
  const CADENCE_STAGES = new Set(['lista_potencial', 'prospeccao', 'conectado']);
  const sdrIds = [...new Set(scopedDeals.map(d => d.assignedSdrId).filter(Boolean))] as string[];
  const totalGoal = sdrIds.reduce((sum, id) => {
    const g = goals.find(g => g.userId === id);
    const cadenceCount = scopedDeals.filter(d =>
      CADENCE_STAGES.has(d.stage) && d.assignedSdrId === id && d.status !== 'won' && d.status !== 'lost'
    ).length;
    return sum + (g?.activitiesPerDay ?? cadenceCount * 4);
  }, 0);
  const today = new Date().toDateString();
  const todayActs = scopedActs.filter(a => {
    const d = (a as any).completedAt?.toDate?.() ?? new Date((a as any).completedAt ?? '');
    return a.status === 'completed' && d.toDateString() === today;
  }).length;

  // ── KPI 3 — Reuniões Agendadas ─────────────────────────────────────────────
  const meetingsScheduled = scopedActs.filter(a => a.type === 'meeting').length;

  // ── KPI 4 — Visitas Agendadas ──────────────────────────────────────────────
  // WizMart: visita_agendada | Smart Café: degustacao_agendada / degustacao_realizada
  const VISIT_STAGES = new Set(['visita_agendada', 'degustacao_agendada', 'degustacao_realizada']);
  const visitDeals = scopedDeals.filter(d => VISIT_STAGES.has(d.stage));
  const visitsByState: Record<string, number> = {};
  visitDeals.forEach(d => {
    const uf = (d as any).uf ?? d.location?.state ?? 'N/D';
    if (uf && uf !== 'N/D') visitsByState[uf] = (visitsByState[uf] ?? 0) + 1;
  });

  // ── KPI 5 — Conquistas por produto ────────────────────────────────────────
  // WizMart: inaugurado | Smart Café: instalacao_realizada
  const wonDeals = scopedDeals.filter(d =>
    d.status === 'won' || d.stage === 'inaugurado' || d.stage === 'instalacao_realizada'
  );
  const conquestsWizmart = wonDeals
    .filter(d => d.productId === 'wizmart')
    .reduce((s, d) => s + (d.conquestValue ?? 1), 0);
  // Smart Café: PDV (contagem) vs Comodato (R$)
  const scWon = wonDeals.filter(d => d.productId === 'smart_cafe');
  const conquestsSmartCafePdv = scWon
    .filter(d => !d.conquestType || d.conquestType === 'pdv')
    .reduce((s, d) => s + (d.conquestValue ?? 1), 0);
  const conquestsSmartCafeComodato = scWon
    .filter(d => d.conquestType === 'contract_value')
    .reduce((s, d) => s + (d.conquestValue ?? 0), 0);

  // ── KPI 6 — Instalações ───────────────────────────────────────────────────
  const installAgendadas = scopedDeals.filter(d => d.stage === 'instalacao_agendada').length;
  const installRealizadas = scopedDeals.filter(d => d.stage === 'instalacao_realizada' || d.stage === 'inaugurado').length;
  const installations = installAgendadas + installRealizadas;

  // ── SDR Comparison ───────────────────────────────────────────────────────
  const sdrUsers = users.filter((u: any) => u.role === 'sdr' && matchesProductId(effectiveProduct, (u.productIds ?? ['wizmart'])[0]));
  const repUsers = users.filter((u: any) => u.role === 'rep' && matchesProductId(effectiveProduct, (u.productIds ?? ['wizmart'])[0]));

  const sdrRows = sdrUsers.map((u: any) => {
    const goal = goals.find((g: any) => g.userId === u.uid);
    const actsDone = scopedActs.filter((a: any) => a.userId === u.uid && a.status === 'completed').length;
    const cadenceDeals = scopedDeals.filter(d =>
      CADENCE_STAGES.has(d.stage) && d.assignedSdrId === u.uid && d.status !== 'won' && d.status !== 'lost'
    ).length;
    const dailyGoal = goal?.activitiesPerDay ?? cadenceDeals * 4;
    const pct = dailyGoal > 0 ? Math.min(100, Math.round((actsDone / dailyGoal) * 100)) : 0;
    const meetings = scopedActs.filter((a: any) => a.userId === u.uid && a.type === 'meeting').length;
    return { uid: u.uid, name: u.name, initials: u.initials, color: u.color, actsDone, dailyGoal, pct, meetings };
  });

  const repRows = repUsers.map((u: any) => {
    const goal = goals.find((g: any) => g.userId === u.uid);
    const myWon = scopedDeals.filter(d => d.assignedRepId === u.uid && d.status === 'won');
    const pdvs  = myWon.reduce((s: number, d: any) => s + (d.conquestValue ?? 1), 0);
    const visits = scopedDeals.filter(d => d.assignedRepId === u.uid && (d.cohortKeys as any)?.visitScheduledMonth).length;
    const visitGoal = goal?.visitsPerMonth ?? 10;
    const conquestGoal = goal?.conquestsPerMonth ?? 2;
    return { uid: u.uid, name: u.name, initials: u.initials, color: u.color, pdvs, visits, visitGoal, conquestGoal };
  });

  // ── Funil de conversão por estágio ────────────────────────────────────────
  const FUNNEL_STAGES = [
    { id: 'lista_potencial',       label: 'Lista Potencial'       },
    { id: 'prospeccao',            label: 'Prospecção'            },
    { id: 'conectado',             label: 'Conectado'             },
    { id: 'visita_agendada',       label: 'Visita Ag.'            },
    { id: 'visita_realizada',      label: 'Visita Real.'          },
    { id: 'degustacao_agendada',   label: 'Degust. Ag.'           },
    { id: 'degustacao_realizada',  label: 'Degust. Real.'         },
    { id: 'proposta_apresentada',  label: 'Proposta'              },
    { id: 'negociacao_contratual', label: 'Negociação'            },
    { id: 'contrato_assinado',     label: 'Contrato'              },
    { id: 'instalacao_agendada',   label: 'Inst. Ag.'             },
    { id: 'instalacao_realizada',  label: 'Inst. Real.'           },
    { id: 'inaugurado',            label: 'Inaugurado'            },
  ];
  const funnelData = FUNNEL_STAGES.map(s => ({
    ...s,
    count: scopedDeals.filter(d => d.stage === s.id).length,
  }));
  const funnelMax = Math.max(...funnelData.map(s => s.count), 1);

  // ── Negócios Prioritários ─────────────────────────────────────────────────
  const openDeals     = scopedDeals.filter(d => d.status !== 'won' && d.status !== 'lost');
  const priorityDeals = openDeals.slice(0, 5);

  useEffect(() => {
    // Em aba oculta (document.hidden) o requestAnimationFrame do anime.js nunca
    // dispara, e os cards ficam presos no keyframe inicial (opacity:0). Pular
    // a animação nesse caso evita cards "invisíveis" — eles continuam com a
    // opacidade padrão (1) por não terem sido tocados pelo anime.js.
    if (document.hidden) return;
    anime({ targets: '.kpi-dir-card', translateY: [16, 0], opacity: [0, 1], duration: 700, delay: anime.stagger(80), easing: 'easeOutExpo' });
  }, [period, productScope]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Cabeçalho + filtros */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="h1">Olá, {user?.name?.split(' ')[0] || 'Gestor'} 👋</h1>
          <p className="muted" style={{ marginTop: 2 }}>Indicadores da operação — {todayLabel}</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {/* Filtro produto */}
          <div className="row" style={{ gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['all','Todos'],['wizmart','WizMart'],['smart_cafe','Smart Café']] as const).map(([val, lbl]) => (
              <button key={val} onClick={() => setProductFilter(val)}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: productFilter === val ? '#1A6B1A' : 'var(--surface)',
                  color: productFilter === val ? '#fff' : 'var(--text-2)', transition: 'all .15s' }}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Filtro período */}
          <div className="row" style={{ gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['today', 'week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 14px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: period === p ? 'var(--primary)' : 'var(--surface)',
                  color: period === p ? '#fff' : 'var(--text-2)',
                  transition: 'all .15s',
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/pipeline')}>
            <Icon name="Plus" size={15} />Novo Negócio
          </button>
        </div>
      </div>

      {/* Grid dos 6 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="kpi-dir-grid">

        {/* 1 — Prospects Compartilhados */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Prospects Compartilhados</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Share2" size={17} color="#1A6B1A" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1A6B1A', fontVariantNumeric: 'tabular-nums' }}>{prospectsShared}</div>
          <div className="muted" style={{ fontSize: 12 }}>BDR → SDR no período</div>
        </div>

        {/* 2 — Atividades Meta vs. Realizado */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Atividades do Dia</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="ListChecks" size={17} color="#D97706" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: todayActs >= totalGoal ? '#1A6B1A' : '#D97706' }}>
            {todayActs}<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-2)' }}>/{totalGoal}</span>
          </div>
          <ActivityGoalBar actual={todayActs} goal={totalGoal} />
        </div>

        {/* 3 — Reuniões Agendadas */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Reuniões Agendadas</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Video" size={17} color="#7C3AED" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>{meetingsScheduled}</div>
          <div className="muted" style={{ fontSize: 12 }}>no período selecionado</div>
        </div>

        {/* 4 — Visitas Agendadas */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Visitas Agendadas</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="MapPin" size={17} color="#B91C1C" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>{visitDeals.length}</div>
          <button
            className="tlink"
            style={{ fontSize: 12, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setShowVisitMap(v => !v)}
          >
            <Icon name={showVisitMap ? 'ChevronUp' : 'Map'} size={13} />
            {showVisitMap ? 'Fechar mapa' : 'Ver por estado'}
          </button>
        </div>

        {/* 5 — Conquistas */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Conquistas (PDVs)</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Trophy" size={17} color="#1A6B1A" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1A6B1A', fontVariantNumeric: 'tabular-nums' }}>{conquestsWizmart + conquestsSmartCafePdv} PDVs</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#DCFCE7', color: '#1A6B1A', fontWeight: 600 }}>
              WizMart: {conquestsWizmart} PDVs
            </span>
            <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>
              Café PDV: {conquestsSmartCafePdv}
            </span>
            {conquestsSmartCafeComodato > 0 && (
              <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>
                Comodato: R$ {conquestsSmartCafeComodato.toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        {/* 6 — Instalações */}
        <div className="card card-pad kpi-dir-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Instalações Agendadas</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Settings2" size={17} color="#1D4ED8" />
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1D4ED8', fontVariantNumeric: 'tabular-nums' }}>{installations}</div>
          <div className="muted" style={{ fontSize: 12 }}>aguardando inauguração</div>
        </div>
      </div>

      {/* Painel de Mapa de Visitas (expansível) */}
      {showVisitMap && (
        <div className="card kpi-dir-card" style={{ animation: 'fadeIn .25s ease' }}>
          <div className="card-hd">
            <h3>Mapa de Visitas por Estado</h3>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge badge-gray">{visitDeals.length} visita{visitDeals.length !== 1 ? 's' : ''}</span>
              <button className="icon-btn" onClick={() => setShowVisitMap(false)}><Icon name="X" size={15} /></button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* Mapa SVG do Brasil */}
            <div style={{ padding: '8px 16px' }}>
              <BrazilMapSVG visitsByState={visitsByState} height={280} />
            </div>
            {/* Lista de visitas */}
            <div style={{ borderLeft: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto' }}>
              {visitDeals.length === 0 ? (
                <div className="muted" style={{ padding: 20, fontSize: 13 }}>Nenhuma visita no período</div>
              ) : visitDeals.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#B91C1C' }}>
                    {d.location?.state ?? 'N/D'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.company}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {d.location?.city ?? '—'}
                      {d.visitPopulation ? ` · ${d.visitPopulation.toLocaleString('pt-BR')} colaboradores` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Funil de leads: atribuídos → visitas → fechamento → contrato */}
      <LeadFunnelWidget deals={scopedDeals} title="Funil de Leads — Time" />

      {/* Negócios Prioritários */}
      <div className="card">
        <div className="card-hd">
          <h3>Negócios em Andamento</h3>
          <button onClick={() => navigate('/pipeline')} className="tlink text-xs font-semibold">Abrir pipeline</button>
        </div>
        <table className="tbl">
          <thead>
            <tr>{['Empresa', 'Produto', 'Estágio', 'Responsável', ''].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {priorityDeals.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">Nenhum negócio em andamento</td></tr>
            ) : priorityDeals.map((d) => {
              const s  = sellerById(sellers, d.assignedRepId || d.assignedSdrId || d.owner);
              const st = stageById(stages, d.stage);
              const prodColor = d.productId === 'smart_cafe' ? { bg: '#FEF3C7', text: '#92400E' } : { bg: '#DCFCE7', text: '#1A6B1A' };
              return (
                <tr key={d.id}>
                  <td><span style={{ fontWeight: 600, fontSize: 13 }}>{d.company || d.name}</span></td>
                  <td>
                    <span className="badge" style={{ background: prodColor.bg, color: prodColor.text, fontWeight: 600 }}>
                      {d.productId === 'smart_cafe' ? 'Smart Café' : 'WizMart'}
                    </span>
                  </td>
                  <td><span className="badge badge-primary">{st.name}</span></td>
                  <td>
                    <div className="row" style={{ gap: 7 }}>
                      <Av initials={s.initials} color={s.color} size={24} />
                      <span style={{ fontSize: 12.5 }}>{s.name.split(' ')[0]}</span>
                    </div>
                  </td>
                  <td>
                    <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => navigate('/pipeline')}>
                      <Icon name="ArrowUpRight" size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Funil de Conversão ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-hd">
          <h3>Funil de Conversão</h3>
          <span className="badge badge-gray">{scopedDeals.length} negócios</span>
        </div>
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {funnelData.map((s) => {
            const pct = funnelMax > 0 ? (s.count / funnelMax) * 100 : 0;
            const isWon = s.id === 'inaugurado' || s.id === 'instalacao_realizada';
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 130, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>{s.label}</div>
                <div style={{ flex: 1, height: 18, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width .5s ease',
                    width: `${pct}%`,
                    background: isWon ? '#1A6B1A' : s.count === 0 ? 'transparent' : 'var(--primary)',
                    opacity: isWon ? 1 : 0.65 + (pct / 100) * 0.35,
                  }} />
                </div>
                <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: isWon ? '#1A6B1A' : 'var(--text-1)', textAlign: 'right', flexShrink: 0 }}>
                  {s.count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SDR — Meta vs. Realizado ─────────────────────────────────────── */}
      {sdrRows.length > 0 && (
        <div className="card">
          <div className="card-hd"><h3>SDRs — Atividades do Dia</h3></div>
          <table className="tbl">
            <thead>
              <tr>{['SDR','Feitas','Meta','%','Reuniões'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sdrRows.map(row => (
                <tr key={row.uid}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Av initials={row.initials} color={row.color} size={26} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{row.name.split(' ')[0]}</span>
                    </div>
                  </td>
                  <td><span style={{ fontWeight: 700, fontSize: 14, color: row.pct >= 100 ? '#1A6B1A' : row.pct >= 60 ? '#D97706' : '#EF4444' }}>{row.actsDone}</span></td>
                  <td><span className="muted">{row.dailyGoal}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--bg-2)', borderRadius: 3, minWidth: 60 }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${row.pct}%`, background: row.pct >= 100 ? '#1A6B1A' : row.pct >= 60 ? '#D97706' : '#EF4444', transition: 'width .5s' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{row.pct}%</span>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{row.meetings}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reps — Visitas e Conquistas ──────────────────────────────────── */}
      {repRows.length > 0 && (
        <div className="card">
          <div className="card-hd"><h3>Representantes — Visitas e PDVs</h3></div>
          <table className="tbl">
            <thead>
              <tr>{['Rep','Visitas','Meta Visitas','PDVs Inaugurados','Meta PDVs'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {repRows.map(row => {
                const visitPct = row.visitGoal > 0 ? Math.min(100, Math.round((row.visits / row.visitGoal) * 100)) : 0;
                const pdvPct   = row.conquestGoal > 0 ? Math.min(100, Math.round((row.pdvs / row.conquestGoal) * 100)) : 0;
                return (
                  <tr key={row.uid}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <Av initials={row.initials} color={row.color} size={26} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{row.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 700, fontSize: 14, color: visitPct >= 100 ? '#1A6B1A' : 'var(--text-1)' }}>{row.visits}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg-2)', borderRadius: 3, minWidth: 60 }}>
                          <div style={{ height: '100%', borderRadius: 3, width: `${visitPct}%`, background: visitPct >= 100 ? '#1A6B1A' : '#3B82F6', transition: 'width .5s' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }}>{visitPct}% de {row.visitGoal}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 14, color: pdvPct >= 100 ? '#1A6B1A' : 'var(--text-1)' }}>
                        {row.pdvs} PDVs
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg-2)', borderRadius: 3, minWidth: 60 }}>
                          <div style={{ height: '100%', borderRadius: 3, width: `${pdvPct}%`, background: pdvPct >= 100 ? '#1A6B1A' : '#8B5CF6', transition: 'width .5s' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }}>{pdvPct}% de {row.conquestGoal}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

// ── Painel SDR ────────────────────────────────────────────────────────────────
function PainelSDR() {
  const navigate = useNavigate();
  const { user }  = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { data: deals } = useFirestoreCollection<Deal>('deals', dealParticipantConstraint(user));
  const { data: sdrActivities } = useFirestoreCollection<Activity>('activities');
  const agendaAlerts = user?.uid ? classifyDueActivities(sdrActivities as any, user.uid) : { overdue: 0, dueToday: 0 };

  const myDeals  = deals.filter(d => d.assignedSdrId === user?.uid && matchesProductId(productScope, d.productId || 'wizmart'));
  const pending  = myDeals.filter(d => !d.tasks?.e || !d.tasks?.w || !d.tasks?.m);
  const doneActs = myDeals.reduce((a, d) => a + (d.tasks?.e ? 1 : 0) + (d.tasks?.w ? 1 : 0) + (d.tasks?.m ? 1 : 0), 0);
  const totalActs = myDeals.length * 3;
  const rate = completionRate(doneActs, totalActs);
  const pct  = Math.round(rate * 100);

  // Cards vencidos: 21 dias sem atividade concluída (Observações do cliente, jul/2026)
  const expiredCount = myDeals.filter(d => isCardExpired(d, getLastActivityAt(sdrActivities as any, d.id))).length;

  useEffect(() => {
    // Ver comentário equivalente em PainelGestao: pular em aba oculta evita
    // cards presos em opacity:0 (o rAF do anime.js não dispara em document.hidden).
    if (document.hidden) return;
    anime({ targets: '.kpi-card-anim', translateY: [20, 0], opacity: [0, 1], duration: 700, delay: anime.stagger(90), easing: 'easeOutExpo' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Cadência de hoje, {user?.name?.split(' ')[0]} 🎯</h1>
          <p className="muted" style={{ marginTop: 2 }}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cadencia')}>
          <Icon name="ListChecks" size={16} />Ver Cadência
        </button>
      </div>

      {/* Alerta de agenda: atrasadas / prestes a atrasar */}
      {(agendaAlerts.overdue > 0 || agendaAlerts.dueToday > 0) && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10,
          background: agendaAlerts.overdue > 0 ? '#FEF2F2' : '#FFFBEB',
          border: `1px solid ${agendaAlerts.overdue > 0 ? '#FECACA' : '#FDE68A'}`,
        }}>
          <Icon name="BellRing" size={17} color={agendaAlerts.overdue > 0 ? '#B91C1C' : '#B45309'} />
          <span style={{ fontSize: 13, fontWeight: 600, color: agendaAlerts.overdue > 0 ? '#B91C1C' : '#92400E' }}>
            {agendaAlerts.overdue > 0 && `${agendaAlerts.overdue} atividade${agendaAlerts.overdue > 1 ? 's' : ''} atrasada${agendaAlerts.overdue > 1 ? 's' : ''}`}
            {agendaAlerts.overdue > 0 && agendaAlerts.dueToday > 0 && ' · '}
            {agendaAlerts.dueToday > 0 && `${agendaAlerts.dueToday} vence${agendaAlerts.dueToday > 1 ? 'm' : ''} hoje`}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/activities')}>
            Ver atividades
          </button>
        </div>
      )}

      {/* Cards vencidos: 21 dias sem atividade concluída */}
      {expiredCount > 0 && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <Icon name="AlarmClockOff" size={17} color="#B91C1C" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#B91C1C' }}>
            {expiredCount} card{expiredCount > 1 ? 's' : ''} vencido{expiredCount > 1 ? 's' : ''} — 3+ semanas sem atividade
          </span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/pipeline')}>
            Ver no Pipeline
          </button>
        </div>
      )}

      <div className="grid-cols-4-responsive">
        {/* Bloco principal do SDR: Atividades do Dia > Conclusão do Dia.
            Clicar direciona para a tela de Atividades (pedido do cliente, jul/2026). */}
        <div
          className="card card-pad kpi-card-anim"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/activities')}
          role="button"
          title="Ver todas as atividades do dia"
        >
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            Atividades do Dia <Icon name="ArrowRight" size={12} />
          </span>
          <div style={{ fontSize: 28, fontWeight: 800, color: pct >= 75 ? 'var(--primary)' : pct >= 50 ? '#F59E0B' : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
          <div className="prog"><div className="fill" style={{ width: pct + '%', background: pct >= 75 ? 'var(--primary)' : pct >= 50 ? '#F59E0B' : '#EF4444', transition: 'width 1s ease' }} /></div>
          <div className="muted" style={{ fontSize: 12 }}>Conclusão do Dia: {doneActs}/{totalActs} atividades</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Cards Ativos</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{myDeals.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>{pending.length} com tarefas pendentes</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Moedas do Ciclo</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>{user?.coinBalance ?? 0}</div>
          <div className="muted" style={{ fontSize: 12 }}>acumuladas no Q atual</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Novos Cards (previsão)</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>{Math.min(3, Math.max(0, Math.floor(3 * rate)))}</div>
          <div className="muted" style={{ fontSize: 12 }}>baseado na taxa de hoje</div>
        </div>
      </div>

      {/* Funil dos meus leads (atribuídos → visitas → fechamento → contrato) */}
      <LeadFunnelWidget deals={myDeals} title="Funil dos Meus Leads" />

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Meus Cards Hoje</h3>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cadencia')}><Icon name="ArrowRight" size={14} />Ver completo</button>
        </div>
        {myDeals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }} className="muted">Nenhum card atribuído. O motor de cadência distribuirá seus cards às 7h.</div>
        ) : (
          myDeals.slice(0, 3).map(d => {
            const done = (d.tasks?.e ? 1 : 0) + (d.tasks?.w ? 1 : 0) + (d.tasks?.m ? 1 : 0);
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{d.company}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['e', 'w', 'm'] as const).map(k => (
                    <div key={k} style={{ width: 24, height: 24, borderRadius: 6, background: d.tasks?.[k] ? 'var(--primary)' : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={d.tasks?.[k] ? 'Check' : k === 'e' ? 'Mail' : k === 'w' ? 'MessageCircle' : 'Calendar'} size={13} color={d.tasks?.[k] ? '#fff' : 'var(--text-2)'} />
                    </div>
                  ))}
                </div>
                <span className="badge badge-gray">{done}/3</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Painel Rep ────────────────────────────────────────────────────────────────
function PainelRep() {
  const navigate = useNavigate();
  const { user }  = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { data: handoffs } = useFirestoreCollection<Handoff>('handoffs');
  const { data: deals }    = useFirestoreCollection<Deal>('deals', dealParticipantConstraint(user));

  const pending    = handoffs.filter(h => h.toRepId === user?.uid && h.status === 'pending_rep_acceptance' && matchesProductId(productScope, h.productId || 'wizmart'));
  const myDeals    = deals.filter(d => d.assignedRepId === user?.uid && d.status === 'open' && matchesProductId(productScope, d.productId || 'wizmart'));
  const wonDeals   = deals.filter(d => d.assignedRepId === user?.uid && d.status === 'won' && matchesProductId(productScope, d.productId || 'wizmart'));

  useEffect(() => {
    // Ver comentário equivalente em PainelGestao: pular em aba oculta evita
    // cards presos em opacity:0 (o rAF do anime.js não dispara em document.hidden).
    if (document.hidden) return;
    anime({ targets: '.kpi-card-anim', translateY: [20, 0], opacity: [0, 1], duration: 700, delay: anime.stagger(90), easing: 'easeOutExpo' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Boa tarde, {user?.name?.split(' ')[0]} 💼</h1>
          <p className="muted" style={{ marginTop: 2 }}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/handoffs')}>
          <Icon name="ArrowRightLeft" size={16} />Meus Handoffs
          {pending.length > 0 && <span className="badge" style={{ marginLeft: 4, background: '#EF4444', color: '#fff', height: 18, padding: '0 6px' }}>{pending.length}</span>}
        </button>
      </div>

      <div className="grid-cols-4-responsive">
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
          {pending.length > 0 && <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: '#EF4444' }} />}
          <span className="label">Handoffs Pendentes</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: pending.length > 0 ? '#EF4444' : 'var(--primary)' }}>{pending.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>aguardando aceite</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Negócios Ativos</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{myDeals.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>no funil Hunter</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Fechados no Mês</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{wonDeals.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>contratos assinados</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Moedas do Ciclo</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706' }}>{user?.coinBalance ?? 0}</div>
          <div className="muted" style={{ fontSize: 12 }}>acumuladas no Q atual</div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <div className="card-hd">
            <h3>Handoffs aguardando resposta</h3>
            <button onClick={() => navigate('/handoffs')} className="tlink text-xs font-semibold">Ver todos</button>
          </div>
          <div style={{ padding: '0 0 8px' }}>
            {pending.slice(0, 3).map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="ArrowRightLeft" size={18} color="var(--primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Handoff #{h.id?.slice(0, 6)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Canal: {h.priorityChannel} · {h.visitType === 'presential' ? 'Presencial' : 'Video call'}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/handoffs')}><Icon name="Check" size={14} />Aceitar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Painel BDR ────────────────────────────────────────────────────────────────
function PainelBDR() {
  const navigate = useNavigate();
  const { user }  = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  // ATENÇÃO: filtro obrigatório pela rule restrita a participantes (Fase B do
  // PLANO_CARD_ASSINATURAS_VISIBILIDADE.md) — sem ele o Firestore rejeita a
  // query inteira pro BDR. Efeito colateral conhecido: `sdrMonitor` abaixo só
  // enxerga leads de CADA SDR que passaram por ESTE bdr especificamente, então
  // a carga "total" mostrada pode ficar subestimada pra SDRs que também
  // trabalham leads de outros BDRs. Fix correto é mover esse agregado pra uma
  // Cloud Function (Admin SDK, ignora rules) — planejado na Fase D2/D3 do
  // plano (getSdrWorkload() vira callable, não util client-side).
  const { data: deals } = useFirestoreCollection<Deal>('deals', dealParticipantConstraint(user));
  const { data: users } = useFirestoreCollection<any>('users');
  const { data: activities } = useFirestoreCollection<any>('activities');
  const { updateDocument: updateDeal } = useFirestoreMutations('deals');
  const { addDocument: addActivity } = useFirestoreMutations('activities');

  const myLeads = deals.filter(d => d.bdrId === user?.uid && matchesProductId(productScope, d.productId || 'wizmart'));
  const inQueue = myLeads.filter(d => d.status === 'in_queue');
  const active  = myLeads.filter(d => d.status === 'open');

  // Atribuição manual BDR→SDR (Fase D2) — convive com a distribuição automática
  // do dailyCadenceEngine; não substitui a fila, é uma via extra pra reagir na
  // hora (ex.: um SDR zerou a cadência e está disponível pra mais cards).
  const [assigningDeal, setAssigningDeal] = useState<Deal | null>(null);
  const handleAssignSdr = async (data: { sdrId: string; notes?: string }) => {
    if (!assigningDeal) return;
    await updateDeal(assigningDeal.id, {
      status: 'open',
      assignedSdrId: data.sdrId,
      assignedAt: new Date(),
      updatedAt: new Date(),
    });
    await addActivity({
      type: 'note',
      dealId: assigningDeal.id,
      userId: user?.uid,
      text: `Atribuído diretamente pelo BDR${data.notes ? ` — ${data.notes}` : ''}`,
      status: 'completed',
      coinsAwarded: 0,
      wasOnTime: true,
      cadenceType: 'manual',
      productId: assigningDeal.productId || 'wizmart',
    });
    setAssigningDeal(null);
  };

  // Leads devolvidos pelo SDR para nova tentativa futura (motivos "Fechou com
  // concorrente" e "Não tem interesse no momento" — Observações do cliente, jul/2026)
  const requeuedLeads = myLeads.filter(d => d.requeuedForBdr);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const reactivateLead = async (dealId: string) => {
    setReactivating(dealId);
    try {
      await updateDeal(dealId, { status: 'in_queue', requeuedForBdr: false, updatedAt: new Date() });
    } catch (err) {
      console.error('[PainelBDR] Erro ao reativar lead:', err);
    } finally {
      setReactivating(null);
    }
  };

  // ── Monitoramento dos SDRs (Observações do cliente, jul/2026):
  // o BDR acompanha a cadência de todos para calibrar o envio de leads.
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const isToday = (raw: any) => {
    const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    if (!d || isNaN(d.getTime())) return false;
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === todayStr;
  };
  const sdrs = users.filter((u: any) => u.role === 'sdr' && u.isActive !== false);
  const sdrWorkloads = getSdrWorkload(deals, sdrs.map((s: any) => s.id), productScope);
  const sdrMonitor = sdrs.map((sdr: any) => {
    const sdrDeals = deals.filter(d => d.assignedSdrId === sdr.id && d.status === 'open'
      && matchesProductId(productScope, d.productId || 'wizmart'));
    const todayActs = activities.filter((a: any) => a.userId === sdr.id && isToday(a.createdAt ?? a.scheduledAt)
      && matchesProductId(productScope, a.productId || 'wizmart'));
    const done = todayActs.filter((a: any) => a.status === 'completed').length;
    const pct = todayActs.length > 0 ? Math.round((done / todayActs.length) * 100) : 100;
    // 4.3 — % de desenvolvimento por lead atribuído: leads com progresso real
    // (visita agendada, bastão passado ou ≥1 atividade concluída no lead)
    const developed = sdrDeals.filter(d =>
      !!d.cohortKeys?.visitScheduledMonth || !!d.visitScheduledAt || !!d.handoffStatus ||
      activities.some((a: any) => a.dealId === d.id && a.userId === sdr.id && a.status === 'completed')
    ).length;
    const devPct = sdrDeals.length > 0 ? Math.round((developed / sdrDeals.length) * 100) : 0;
    const leads = sdrWorkloads.find(w => w.sdrId === sdr.id)?.leads ?? sdrDeals.length;
    return { sdr, leads, total: todayActs.length, done, pct, developed, devPct };
  });

  // 4.2 — % dos meus leads que geraram reunião/visita agendada (visão Pareto 80/20)
  const myMeetingLeads = myLeads.filter(d => !!d.cohortKeys?.visitScheduledMonth || !!d.visitScheduledAt);
  const meetingPct = myLeads.length > 0 ? Math.round((myMeetingLeads.length / myLeads.length) * 100) : 0;

  useEffect(() => {
    // Ver comentário equivalente em PainelGestao: pular em aba oculta evita
    // cards presos em opacity:0 (o rAF do anime.js não dispara em document.hidden).
    if (document.hidden) return;
    anime({ targets: '.kpi-card-anim', translateY: [20, 0], opacity: [0, 1], duration: 700, delay: anime.stagger(90), easing: 'easeOutExpo' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Olá, {user?.name?.split(' ')[0]} 🎯</h1>
          <p className="muted" style={{ marginTop: 2 }}>Seus leads gerados e na fila do SDR</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/pipeline')}>
          <Icon name="Plus" size={16} />Novo Lead
        </button>
      </div>

      <div className="grid-cols-3-responsive">
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Leads Gerados (mês)</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{myLeads.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>total de leads criados por você</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Na Fila SDR</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7C3AED' }}>{inQueue.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>aguardando distribuição</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Em Cadência SDR</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#B45309' }}>{active.length}</div>
          <div className="muted" style={{ fontSize: 12 }}>sendo trabalhados pelo SDR</div>
        </div>
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} title="Meta Pareto: ~20% dos leads devem concentrar 80% das reuniões — acompanhe a taxa de conversão dos seus leads em reunião agendada.">
          <span className="label">Leads → Reunião (Pareto 80/20)</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: meetingPct >= 20 ? 'var(--primary)' : '#B45309' }}>{meetingPct}%</div>
          <div className="muted" style={{ fontSize: 12 }}>{myMeetingLeads.length} de {myLeads.length} leads com reunião agendada</div>
        </div>
      </div>

      {/* Funil dos leads gerados por mim */}
      <LeadFunnelWidget deals={myLeads} title="Funil dos Meus Leads" />

      {/* Atribuição manual BDR→SDR — via extra além da distribuição automática */}
      {inQueue.length > 0 && (
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Leads aguardando distribuição</h3>
            <span className="badge" style={{ background: '#F3E8FF', color: '#7C3AED', border: '1px solid #E9D5FF' }}>
              {inQueue.length}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            O motor de cadência distribui automaticamente às 7h — atribua direto se já souber pra quem deve ir.
          </p>
          {inQueue.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{d.company}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setAssigningDeal(d)}>
                <Icon name="UserPlus" size={13} />
                Atribuir SDR
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Leads devolvidos pelo SDR para nova tentativa de prospecção futura */}
      {requeuedLeads.length > 0 && (
        <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Leads para nova tentativa</h3>
            <span className="badge" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
              {requeuedLeads.length}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            Devolvidos pelo SDR ("Fechou com concorrente" ou "Não tem interesse no momento"). Reative quando for a hora de tentar de novo.
          </p>
          {requeuedLeads.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{d.company} · {getLostReasonLabel(d.lostReason)}</div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={reactivating === d.id}
                onClick={() => reactivateLead(d.id)}
              >
                <Icon name="RotateCcw" size={13} />
                {reactivating === d.id ? 'Reativando...' : 'Reativar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Monitoramento dos SDRs — cadência do dia de cada um */}
      <div className="card card-pad kpi-card-anim" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Cadência dos SDRs hoje</h3>
          <span className="muted" style={{ fontSize: 12 }}>para calibrar o envio de novos leads</span>
        </div>
        {sdrMonitor.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: '20px 0', fontSize: 13 }}>Nenhum SDR ativo encontrado.</div>
        ) : (
          sdrMonitor.map(({ sdr, leads, total, done, pct, developed, devPct }) => (
            <div key={sdr.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <Av initials={sdr.initials ?? (sdr.name ?? '?').slice(0, 2).toUpperCase()} color={sdr.color ?? '#1A6B1A'} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{sdr.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {leads} lead{leads !== 1 ? 's' : ''} em cadência · {developed} desenvolvido{developed !== 1 ? 's' : ''} ({devPct}%)
                </div>
              </div>
              <div style={{ width: 130 }}>
                <div className="prog" style={{ height: 8 }}>
                  <div className="fill" style={{ width: pct + '%', background: pct >= 75 ? 'var(--primary)' : pct >= 50 ? '#F59E0B' : '#EF4444' }} />
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 70, textAlign: 'right', color: pct >= 75 ? 'var(--primary)' : pct >= 50 ? '#B45309' : '#B91C1C' }}>
                {done}/{total} · {pct}%
              </span>
            </div>
          ))
        )}
      </div>

      {assigningDeal && (
        <AssignSdrModal
          deal={assigningDeal}
          sdrs={sdrs}
          workloadBySdr={sdrWorkloads}
          onConfirm={handleAssignSdr}
          onCancel={() => setAssigningDeal(null)}
        />
      )}
    </div>
  );
}

// ── Painel Viewer ─────────────────────────────────────────────────────────────
function PainelViewer() {
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { data: deals } = useFirestoreCollection<Deal>('deals');
  const scopedDeals = deals.filter(d => matchesProductId(productScope, d.productId || 'wizmart'));
  const wonDeals  = scopedDeals.filter(d => d.status === 'won');
  const openDeals = scopedDeals.filter(d => d.status === 'open');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 className="h1">Visão Geral — Somente Leitura</h1>
      <div className="grid-cols-3-responsive">
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Negócios Abertos</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{openDeals.length}</div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Negócios Ganhos (mês)</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{wonDeals.length}</div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Total Negócios</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{scopedDeals.length}</div>
        </div>
      </div>
    </div>
  );
}

import { usePermissions } from '../../hooks/usePermissions';

// ── Componente principal ──────────────────────────────────────────────────────
export function DashboardPage() {
  const { hasPermission } = usePermissions();

  if (hasPermission('view_management_dashboard')) return <PainelGestao />;
  if (hasPermission('view_sdr_dashboard'))        return <PainelSDR />;
  if (hasPermission('view_rep_dashboard'))        return <PainelRep />;
  if (hasPermission('view_bdr_dashboard'))        return <PainelBDR />;
  if (hasPermission('view_viewer_dashboard'))     return <PainelViewer />;

  return <PainelViewer />;
}

export default DashboardPage;
