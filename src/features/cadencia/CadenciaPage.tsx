/**
 * CadenciaPage.tsx — Tela de Cadência Diária do SDR
 *
 * Exibe os cards da fila de hoje com as 4 atividades obrigatórias por card.
 * A fila é lida de `cadence_queues/{uid}/daily/{YYYY-MM-DD}` (gerada pelo
 * Cloud Function `dailyCadenceEngine` às 7h BRT).
 *
 * Fluxo por atividade:
 *  Pendente → clica → CompleteActivityModal → registra outcome + opcional reschedule
 *  Concluída → exibe checkmark verde com timestamp
 *
 * Métricas no header:
 *  - Taxa de conclusão do dia (barra de progresso + %)
 *  - Previsão de cards amanhã (fórmula)
 *  - Moedas ganhas hoje
 *  - Streak de dias consecutivos
 */

import { useState } from 'react';
import anime from 'animejs';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { useCadencia } from './useCadencia';
import { useCadenceConfig } from './useCadenceConfig';
import { CompleteActivityModal } from './CompleteActivityModal';
import {
  SDR_ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG,
  PERIOD_LABEL,
  dayOffsetLabel,
  calcNewCards,
  calcCompletionRate,
  groupActivitiesByType,
  classifyDueActivities,
  type ActivityType,
  type CadenceCard,
  type SequenceStep,
} from '../../utils/cadenceUtils';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { PRODUCT_COLOR } from '../../utils/crmFormat';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';

// ── Barra de progresso circular (SVG) ────────────────────────────────────────
function CircleProgress({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={8}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
      />
    </svg>
  );
}

// ── Card de atividade individual ──────────────────────────────────────────────
interface ActivityButtonProps {
  type: ActivityType;
  status: 'pending' | 'completed' | 'overdue' | 'skipped';
  activityId?: string;
  onComplete: (type: ActivityType, activityId: string) => void;
}

function ActivityButton({ type, status, activityId, onComplete }: ActivityButtonProps) {
  const cfg = ACTIVITY_TYPE_CONFIG[type];
  const done = status === 'completed';
  const overdue = status === 'overdue';

  return (
    <button
      id={`act-btn-${activityId || type}`}
      onClick={() => !done && activityId && onComplete(type, activityId)}
      disabled={done}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '12px 10px', borderRadius: 10, flex: 1,
        border: `1.5px solid ${done ? cfg.color + '44' : overdue ? '#EF4444' : 'var(--border)'}`,
        background: done ? cfg.bg : overdue ? '#FEF2F2' : '#fff',
        cursor: done ? 'default' : 'pointer', transition: 'all 0.15s',
        opacity: done ? 1 : 0.92,
        position: 'relative',
      }}
      onMouseEnter={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = cfg.color; }}
      onMouseLeave={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = overdue ? '#EF4444' : 'var(--border)'; }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: done ? cfg.color : overdue ? '#EF444415' : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={done ? 'Check' : cfg.icon} size={18} color={done ? '#fff' : overdue ? '#EF4444' : cfg.color} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: done ? cfg.color : overdue ? '#EF4444' : 'var(--text-primary)', textAlign: 'center' }}>
        {cfg.label}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500 }}>
        {done ? '✓ feito' : overdue ? 'atrasado' : '+1 🪙'}
      </span>
    </button>
  );
}

// ── Card de um deal na fila ───────────────────────────────────────────────────
interface CadenceCardProps {
  card: CadenceCard;
  index?: number;
  onComplete: (type: ActivityType, activityId: string, card: CadenceCard) => void;
  /** Abre a página inteira do lead (/lead/:dealId) */
  onOpenLead?: (dealId: string) => void;
  /** Sequência configurada pelo admin (vazia = ordem legada fixa) */
  sequence: SequenceStep[];
}

function CadenceCardItem({ card, onComplete, onOpenLead, sequence }: CadenceCardProps) {
  // Cards novos têm o blitz de canais do dia 0; follow-ups/passos tardios têm 1 contato único.
  const presentTypes = SDR_ACTIVITY_TYPES
    .filter(t => card.activities[t])
    .slice()
    .sort((a, b) => (card.activities[a]?.sequenceOrder ?? SDR_ACTIVITY_TYPES.indexOf(a)) - (card.activities[b]?.sequenceOrder ?? SDR_ACTIVITY_TYPES.indexOf(b)));
  const done = presentTypes.filter(t => card.activities[t]?.status === 'completed').length;
  const total = presentTypes.length;
  const prodColor = card.productId ? PRODUCT_COLOR[card.productId as 'wizmart' | 'smart_cafe']?.primary : '#1A6B1A';
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;

  // Canais que essa sequência prevê pra este card, mas que ainda não chegaram
  // (dayOffset > 0 e ainda não presentes) — só pra cards novos do dia 0, só
  // orientação visual (o passo real é criado pelo motor no dia certo).
  const upcomingSteps = card.isNew
    ? sequence.filter(s => s.dayOffset > 0 && !card.activities[s.type])
    : [];

  return (
    <div
      className="card cadence-card-anim"
      style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden' }}
    >
      {/* Faixa lateral de produto */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: prodColor }} />

      {/* Badge "Novo card" / follow-up da régua semanal */}
      {card.isNew && (
        <span className="badge" style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, background: '#EDE9FE', color: '#7C3AED', border: '1px solid #C4B5FD' }}>
          ✨ Novo hoje
        </span>
      )}
      {card.followUp && (
        <span className="badge" style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B44' }}>
          🔁 {card.weekLabel ?? 'Follow-up'}
        </span>
      )}
      {card.sequenceStep && (
        <span className="badge" style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, background: '#EFF6FF', color: '#1E3A5F', border: '1px solid #3B82F644' }}>
          🧭 {card.sequenceLabel ?? 'Sequência'}
        </span>
      )}

      {/* Cabeçalho do card — clique abre a página inteira do lead */}
      <div
        style={{ paddingRight: 70, cursor: onOpenLead ? 'pointer' : 'default' }}
        onClick={() => onOpenLead?.(card.dealId)}
        title="Abrir a página do lead"
        role={onOpenLead ? 'button' : undefined}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {card.contactName}
          {onOpenLead && <Icon name="ExternalLink" size={12} color="var(--text-2)" />}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{card.companyName}</div>
      </div>

      {/* Progresso de atividades */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="prog" style={{ flex: 1 }}>
          <div className="fill" style={{ width: pct + '%', transition: 'width 0.5s ease', background: done === total ? '#22C55E' : 'var(--primary)' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: done === total ? '#22C55E' : 'var(--text-2)', minWidth: 32 }}>
          {done}/{total}
        </span>
      </div>

      {/* Botões de atividade — apenas os canais deste card, na ordem da sequência */}
      <div className="cadence-buttons-grid">
        {presentTypes.map(type => {
          const act = card.activities[type];
          return (
            <ActivityButton
              key={type}
              type={type}
              status={act?.status ?? 'pending'}
              activityId={act?.activityId}
              onComplete={(t, id) => onComplete(t, id, card)}
            />
          );
        })}
      </div>

      {/* Orientação da sequência: canais previstos pra depois, ainda não liberados */}
      {upcomingSteps.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Icon name="CalendarClock" size={12} />
          {upcomingSteps.map((s, i) => (
            <span key={s.type}>
              {ACTIVITY_TYPE_CONFIG[s.type].label} {dayOffsetLabel(s.dayOffset).toLowerCase()} ({PERIOD_LABEL[s.period].toLowerCase()})
              {i < upcomingSteps.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CadenciaPage ──────────────────────────────────────────────────────────────
export function CadenciaPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { queue, loading, refreshQueue } = useCadencia();
  const { config: cadenceConfig } = useCadenceConfig();

  const [completing, setCompleting] = useState<{
    activityId: string;
    activityType: ActivityType;
    dealId: string;
    contactName: string;
    companyName: string;
  } | null>(null);

  // Agrupamento (Observações do cliente, jul/2026): por card (cliente 1, cliente 2)
  // ou por bloco de canal (todas as ligações juntas, todos os e-mails juntos...)
  const [groupMode, setGroupMode] = useState<'card' | 'bloco'>('card');

  // Alertas de agenda: atrasadas e prestes a atrasar (vencem hoje)
  const { data: myActivities } = useFirestoreCollection<any>('activities');
  const alerts = user?.uid
    ? classifyDueActivities(myActivities, user.uid)
    : { overdue: 0, dueToday: 0 };

  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  const { productScope } = useUIStore();

  const filteredCards = queue
    ? queue.cards.filter(card => matchesProductId(productScope, (card.productId || 'wizmart') as any))
    : [];

  // Ordem dos canais configurada pelo admin (settings/cadence.sdr.sequence) —
  // usada tanto pra ordenar os cards (modo "Por cliente") quanto os blocos
  // (modo "Por bloco"). Sem configuração, cai na ordem legada fixa.
  const channelOrder = cadenceConfig.sequence.length === SDR_ACTIVITY_TYPES.length
    ? cadenceConfig.sequence.map(s => s.type)
    : SDR_ACTIVITY_TYPES;

  // Cards ordenados pela urgência: o card cuja próxima etapa PENDENTE vem mais
  // cedo na sequência sobe pro topo — é isso que dá a "orientação clara da
  // sequência" no nível da tela inteira, não só dentro de cada card.
  const sortedCards = filteredCards.slice().sort((a, b) => {
    const priority = (card: CadenceCard) => {
      const pending = SDR_ACTIVITY_TYPES
        .map(t => card.activities[t])
        .filter((act): act is NonNullable<typeof act> => !!act && act.status !== 'completed');
      if (pending.length === 0) return Infinity;
      return Math.min(...pending.map(act => act.sequenceOrder ?? channelOrder.indexOf(act.type)));
    };
    return priority(a) - priority(b);
  });

  let filteredRequired = 0;
  let filteredCompleted = 0;
  filteredCards.forEach(card => {
    SDR_ACTIVITY_TYPES.forEach(type => {
      const act = card.activities[type];
      if (act) {
        filteredRequired++;
        if (act.status === 'completed') {
          filteredCompleted++;
        }
      }
    });
  });

  const completionPct = queue
    ? (filteredRequired > 0 ? Math.round(calcCompletionRate(filteredCompleted, filteredRequired) * 100) : 100)
    : 0;

  const handleActivityClick = (type: ActivityType, activityId: string, card: CadenceCard) => {
    // Animação de pulso no botão clicado
    anime({ targets: `#act-btn-${activityId}`, scale: [0.95, 1.03, 1], duration: 300, easing: 'easeOutElastic(1, .5)' });

    setCompleting({
      activityId,
      activityType: type,
      dealId: card.dealId,
      contactName: card.contactName,
      companyName: card.companyName,
    });
  };

  const handleActivitySuccess = () => {
    setCompleting(null);
    // Animação de celebração na taxa de conclusão
    anime({ targets: '.completion-pct', scale: [1, 1.15, 1], duration: 500, easing: 'easeOutElastic(1, .5)' });
    refreshQueue();
  };

  // Calcula previsão de cards amanhã baseado na taxa atual
  const tomorrowCards = queue
    ? calcNewCards(calcCompletionRate(filteredCompleted, filteredRequired))
    : 3;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Cadência Diária</h1>
        <div className="grid-cols-4-responsive">
          {[0,1,2,3].map(i => <div key={i} className="sk" style={{ height: 90, borderRadius: 10 }} />)}
        </div>
        {[0,1,2].map(i => <div key={i} className="sk" style={{ height: 160, borderRadius: 10 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="h1">Cadência de hoje 🎯</h1>
          <p className="muted" style={{ marginTop: 2, textTransform: 'capitalize' }}>{todayLabel}</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={refreshQueue}>
            <Icon name="RefreshCw" size={14} />Atualizar
          </button>
          {(user?.role === 'master' || user?.role === 'manager') && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/activities')}>
              <Icon name="Activity" size={14} />Todas as atividades
            </button>
          )}
        </div>
      </div>

      {/* Alertas de agenda: atrasadas / prestes a atrasar */}
      {(alerts.overdue > 0 || alerts.dueToday > 0) && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10,
          background: alerts.overdue > 0 ? '#FEF2F2' : '#FFFBEB',
          border: `1px solid ${alerts.overdue > 0 ? '#FECACA' : '#FDE68A'}`,
        }}>
          <Icon name="BellRing" size={17} color={alerts.overdue > 0 ? '#B91C1C' : '#B45309'} />
          <span style={{ fontSize: 13, fontWeight: 600, color: alerts.overdue > 0 ? '#B91C1C' : '#92400E' }}>
            {alerts.overdue > 0 && `${alerts.overdue} atividade${alerts.overdue > 1 ? 's' : ''} atrasada${alerts.overdue > 1 ? 's' : ''}`}
            {alerts.overdue > 0 && alerts.dueToday > 0 && ' · '}
            {alerts.dueToday > 0 && `${alerts.dueToday} vence${alerts.dueToday > 1 ? 'm' : ''} hoje`}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/activities')}>
            Ver atividades
          </button>
        </div>
      )}

      {/* KPI Cards de progresso */}
      <div className="grid-cols-4-responsive">

        {/* Taxa de conclusão com círculo */}
        <div
          className="card card-pad"
          style={{ display: 'flex', gap: 14, alignItems: 'center' }}
          title="Atividades de Hoje: as ações de contato (ligação, e-mail, WhatsApp) que você precisa executar nos cards de hoje."
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <CircleProgress pct={completionPct} size={72} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="completion-pct" style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
                {completionPct}%
              </span>
            </div>
          </div>
          <div>
            <div className="label" style={{ fontSize: 11 }}>Atividades de Hoje</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {queue ? filteredCompleted : 0}/{queue ? filteredRequired : 0}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>ações de contato concluídas</div>
          </div>
        </div>

        {/* Cards na fila */}
        <div
          className="card card-pad"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          title="Cards de Hoje: os leads distribuídos para você trabalhar hoje. Cada card gera suas próprias atividades de contato."
        >
          <span className="label" style={{ fontSize: 11 }}>Cards de Hoje</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
            {filteredCards.length}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>leads atribuídos a você</div>
        </div>

        {/* Previsão de amanhã */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label" style={{ fontSize: 11 }}>Previsão Amanhã</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: tomorrowCards > 0 ? 'var(--primary)' : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>
            {tomorrowCards}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {tomorrowCards === 0 ? '⚠️ complete mais hoje' : 'novos cards'}
          </div>
        </div>

        {/* Moedas do ciclo */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label" style={{ fontSize: 11 }}>Moedas do Ciclo</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>
            {user?.coinBalance ?? 0}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>acumuladas no Q atual</div>
        </div>
      </div>

      {/* Conteúdo principal */}
      {!queue || filteredCards.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>
            {completionPct === 100 ? '🎉' : '⏳'}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            {completionPct === 100
              ? 'Parabéns! Cadência completa!'
              : 'Sua fila de hoje ainda não foi gerada'}
          </div>
          <p className="muted" style={{ fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            {completionPct === 100
              ? 'Você completou todas as atividades de hoje. Amanhã você receberá novos cards às 7h.'
              : 'O motor de cadência distribui os cards todo dia às 7h (horário de Brasília). Se você está vendo isso depois das 7h, clique em "Atualizar".'}
          </p>
          <button className="btn btn-outline" style={{ margin: '16px auto 0' }} onClick={refreshQueue}>
            <Icon name="RefreshCw" size={15} />Verificar novos cards
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Barra de meta diária + seletor de agrupamento */}
          <div className="card" style={{ padding: '12px 20px' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Meta diária</span>
              <div className="row" style={{ gap: 10 }}>
                <div className="seg">
                  <button className={groupMode === 'card' ? 'on' : ''} onClick={() => setGroupMode('card')} title="Um card por cliente, com todas as atividades dele">Por cliente</button>
                  <button className={groupMode === 'bloco' ? 'on' : ''} onClick={() => setGroupMode('bloco')} title="Todas as ligações juntas, todos os e-mails juntos...">Por bloco</button>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {filteredCompleted} de {filteredRequired} atividades
                </span>
              </div>
            </div>
            <div className="prog" style={{ height: 10 }}>
              <div className="fill" style={{
                width: completionPct + '%',
                transition: 'width 0.8s ease',
                background: completionPct >= 100 ? '#22C55E' : completionPct >= 75 ? 'var(--primary)' : completionPct >= 50 ? '#F59E0B' : '#EF4444',
              }} />
            </div>
          </div>

          {groupMode === 'card' ? (
            /* Por cliente: ordenado pela etapa pendente mais urgente da sequência */
            sortedCards.map((card, i) => (
              <CadenceCardItem
                key={card.dealId}
                card={card}
                index={i}
                onComplete={handleActivityClick}
                onOpenLead={dealId => navigate(`/lead/${dealId}`)}
                sequence={cadenceConfig.sequence}
              />
            ))
          ) : (
            /* Por bloco de canal, na ordem configurada (ex.: Email → LinkedIn → WhatsApp → Ligação) */
            groupActivitiesByType(filteredCards, channelOrder).map(group => {
              const cfg = ACTIVITY_TYPE_CONFIG[group.type];
              const pendingCount = group.items.filter(i => i.status !== 'completed').length;
              return (
                <div key={group.type} className="card" style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={cfg.icon} size={16} color={cfg.color} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: 14 }}>{cfg.label}</h3>
                    <span className="badge badge-gray" style={{ marginLeft: 'auto' }}>
                      {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {group.items.map(item => {
                    const doneItem = item.status === 'completed';
                    return (
                      <div key={item.activityId ?? item.card.dealId + group.type} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
                        <div
                          style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                          onClick={() => navigate(`/lead/${item.card.dealId}`)}
                          title="Abrir a página do lead"
                        >
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.card.contactName}
                            {item.card.followUp && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · {item.card.weekLabel}</span>}
                          </div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{item.card.companyName}</div>
                        </div>
                        {doneItem ? (
                          <span style={{ color: '#22C55E', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <Icon name="Check" size={14} /> feito
                          </span>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ flexShrink: 0 }}
                            onClick={() => item.activityId && handleActivityClick(group.type, item.activityId, item.card)}
                          >
                            Concluir
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal de completar atividade */}
      {completing && (
        <CompleteActivityModal
          activityId={completing.activityId}
          activityType={completing.activityType}
          dealId={completing.dealId}
          contactName={completing.contactName}
          companyName={completing.companyName}
          onSuccess={handleActivitySuccess}
          onCancel={() => setCompleting(null)}
        />
      )}
    </div>
  );
}

export default CadenciaPage;
