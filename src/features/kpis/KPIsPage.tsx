import { useState, useMemo, useEffect } from 'react';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import type { Deal, Activity, User, TvLink, Funnel, CoinTransaction, UserGoal } from '../../types/crm';
import { BrazilMapSVG } from '../../components/ui/BrazilMapSVG';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { fmtCurrency, fmtCurrencyCompact, canViewTeamKPIs, PRODUCT_COLOR, ROLE_LABEL } from '../../utils/crmFormat';

// Helper de parsing de datas
const parseDate = (d: any): Date | null => {
  if (!d) return null;
  if (d.toDate) return d.toDate();
  if (d.seconds) return new Date(d.seconds * 1000);
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// Arco de progresso circular SVG para tarefas
function Arc({ pct, size = 120, strokeColor = 'var(--primary)' }: { pct: number; size?: number; strokeColor?: string }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const offVal = c * (1 - pct / 100);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={8} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offVal}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

// Card de Estatística — versão compacta (sem sub-texto)
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  icon: string;
  themeColor: string;
}

function StatCard({ label, value, sub, trend, icon, themeColor }: StatCardProps) {
  return (
    <div className="card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: themeColor }} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label" style={{ fontSize: 10.5 }}>{label}</span>
        <Icon name={icon} size={14} color={themeColor} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="row" style={{ gap: 5, fontSize: 10.5 }}>
          {trend !== undefined && (
            <span style={{ color: trend >= 0 ? 'var(--primary)' : 'var(--danger)', fontWeight: 700 }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
          <span className="muted">{sub}</span>
        </div>
      )}
    </div>
  );
}

// Modal de geração de link de TV
interface GenLinkModalProps {
  onClose: () => void;
  onGenerate: (deviceName: string, allowedMetrics: string[], duration: string, productId: string, rankingPeriod: string) => void;
}

function GenLinkModal({ onClose, onGenerate }: GenLinkModalProps) {
  const [deviceName, setDeviceName] = useState('TV Recepção');
  const [duration, setDuration] = useState('30 dias');
  const [productId, setProductId] = useState('all');
  const [rankingPeriod, setRankingPeriod] = useState('week');
  const [metrics, setMetrics] = useState<Record<string, boolean>>({
    meta_pct: true,
    ganhos_hoje_count: true,
    tarefas: true,
    ranking_pontos: true,
    ranking_moedas: false,
    // Reuniões e visitas do mês com quebra Inbound/Outbound (slides 2 e 10 do
    // deck "Desenho CRM"). Ligada por padrão: é número operacional, não
    // financeiro — diferente de `financeiro_real`.
    agenda_origem: true,
    // Ranking do Time de SDRs (PLANO_DESENHO_CRM_2). Desligada por padrão: mostra
    // o primeiro nome de cada SDR num nó público — o admin liga de propósito.
    ranking_sdr: false,
    financeiro_real: false // Desativado por padrão para TVs públicas!
  });

  const toggleMetric = (k: string) => {
    setMetrics(prev => ({ ...prev, [k]: !prev[k] }));
  };

  const handleGen = () => {
    const selected = Object.keys(metrics).filter(k => metrics[k]);
    onGenerate(deviceName, selected, duration, productId, rankingPeriod);
  };

  return (
    <div className="modal-ov" onClick={onClose} style={{ zIndex: 500 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
        <div className="modal-hd" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Gerar Novo Link de TV Display</h3>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onClose} aria-label="Fechar modal">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field" style={{ margin: 0 }}>
            <div className="fl">Identificação do Dispositivo (TV)</div>
            <input
              className="input"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="Ex: TV Recepção, TV Corredor Vendas"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Duração do Token</div>
              <select className="input" value={duration} onChange={e => setDuration(e.target.value)}>
                <option value="7 dias">7 dias</option>
                <option value="30 dias">30 dias</option>
                <option value="90 dias">90 dias</option>
                <option value="Nunca expira">Nunca expira</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Filtro de Produto</div>
              <select className="input" value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="all">Todos os Produtos</option>
                <option value="wizmart">WizMart</option>
                <option value="smart_cafe">Smart Café</option>
              </select>
            </div>
          </div>

          <div>
            {metrics.ranking_sdr && (
              <div className="field" style={{ margin: '0 0 14px' }}>
                <div className="fl">Período inicial do Ranking de SDRs</div>
                <select className="input" value={rankingPeriod} onChange={e => setRankingPeriod(e.target.value)}>
                  <option value="day">Dia</option>
                  <option value="week">Semana</option>
                  <option value="month">Mês</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Quem estiver na TV pode alternar entre Dia, Semana e Mês no próprio painel.
                </div>
              </div>
            )}
            <div className="label" style={{ marginBottom: 8, fontSize: 12 }}>Métricas Habilitadas no Canal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['meta_pct', 'Exibir Progresso % da Meta', 'Percentual atingido da meta mensal da filial.'],
                ['ganhos_hoje_count', 'Exibir Volume de Negócios Hoje', 'Contagem de negócios ganhos no dia.'],
                ['tarefas', 'Exibir Progresso das Tarefas', 'Contagem de atividades concluídas hoje.'],
                ['ranking_pontos', 'Exibir Leaderboard de Pontos', 'Pódio e classificação de pontuação comercial.'],
                ['ranking_moedas', 'Exibir Leaderboard de Moedas', 'Pódio e classificação de moedas acumuladas.'],
                ['agenda_origem', 'Exibir Reuniões e Visitas do Mês', 'Contagem do mês com a quebra Inbound / Outbound.'],
                ['ranking_sdr', 'Exibir Ranking do Time de SDRs', 'Pódio por visitas agendadas, com atividades e reuniões. Mostra o primeiro nome de cada SDR. Sozinha, ocupa a TV inteira.'],
                ['financeiro_real', 'Exibir Valores Financeiros Reais (R$)', '⚠️ ALTO RISCO: Exibe faturamento explícito (R$) na TV pública.']
              ].map(([k, label, desc]) => (
                <label key={k} className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
                  <div
                    className={`chk ${metrics[k] ? 'on' : ''}`}
                    style={{ marginTop: 2, flexShrink: 0 }}
                    onClick={() => toggleMetric(k)}
                  >
                    {metrics[k] && <Icon name="Check" size={12} strokeWidth={3} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: k === 'financeiro_real' && metrics[k] ? 'var(--danger)' : 'var(--text-1)' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGen}>
            <Icon name="Link" size={16} />
            Gerar Link
          </button>
        </div>
      </div>
    </div>
  );
}

export function KPIsPage() {
  const { user: currentUser } = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const [period, setPeriod] = useState<'Hoje' | 'Semana' | 'Mês' | 'Trimestre'>('Mês');
  const [productFilter, setProductFilter] = useState<'all' | 'wizmart' | 'smart_cafe'>(productScope);
  const [sellerFilter, setSellerFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [visibleTokenId, setVisibleTokenId] = useState<string | null>(null);

  // Firestore collections
  const { data: deals, loading: loadingDeals } = useFirestoreCollection<Deal>('deals');
  const { data: activities, loading: loadingActivities } = useFirestoreCollection<Activity>('activities');
  const { data: coinLedger } = useFirestoreCollection<CoinTransaction>('coin_ledger');
  const { data: users } = useFirestoreCollection<User>('users');
  const { data: funnels } = useFirestoreCollection<Funnel>('funnels');
  const { data: tvLinks, loading: loadingLinks } = useFirestoreCollection<TvLink>('tv_links');
  const { data: userGoals } = useFirestoreCollection<UserGoal>('user_goals');

  const { addDocument, deleteDocument } = useFirestoreMutations('tv_links');

  useEffect(() => {
    setProductFilter(productScope);
  }, [productScope]);

  // Cores do tema baseado no filtro de produto
  const currentThemeColor = productFilter === 'wizmart' 
    ? PRODUCT_COLOR.wizmart.primary 
    : productFilter === 'smart_cafe' 
    ? PRODUCT_COLOR.smart_cafe.primary 
    : 'var(--primary)';

  // ── Filtros de Tempo ──
  const dateLimits = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(now);
    week.setDate(now.getDate() - now.getDay());
    week.setHours(0,0,0,0);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    return {
      Hoje: today,
      Semana: week,
      Mês: month,
      Trimestre: quarter
    };
  }, []);

  const targetStartDate = dateLimits[period];

  // ── Regiões do Mapa de Visitas (Abstract Region Bubble Model) ──
  const regions = [
    { id: 'sudeste', name: 'Sudeste', states: ['SP', 'RJ', 'MG', 'ES'], x: 220, y: 150, r: 35, color: '#3B82F6' },
    { id: 'sul', name: 'Sul', states: ['PR', 'SC', 'RS'], x: 170, y: 220, r: 28, color: '#10B981' },
    { id: 'nordeste', name: 'Nordeste', states: ['BA', 'PE', 'CE', 'RN', 'PB', 'AL', 'SE', 'MA', 'PI'], x: 280, y: 70, r: 32, color: '#F59E0B' },
    { id: 'centro_oeste', name: 'Centro-Oeste', states: ['DF', 'GO', 'MT', 'MS'], x: 170, y: 110, r: 25, color: '#8B5CF6' },
    { id: 'norte', name: 'Norte', states: ['AM', 'PA', 'RO', 'RR', 'AC', 'TO', 'AP'], x: 90, y: 50, r: 24, color: '#EC4899' }
  ];

  // Determinar papel a ser renderizado (usuários normais são travados no próprio ID)
  const isManagement = canViewTeamKPIs(currentUser?.role || 'viewer');
  const activeSellerId = isManagement ? sellerFilter : (currentUser?.uid || '');
  const activeSellerUser = users.find(u => u.id === activeSellerId);

  // ── Consolidação Dinâmica client-side ──
  const kpis = useMemo(() => {
    // 1. Filtra Deals
    const fDeals = deals.filter(d => {
      if (productFilter !== 'all' && d.productId !== productFilter) return false;
      if (activeSellerId !== 'all') {
        const matchesOwner = d.owner === activeSellerId || d.assignedRepId === activeSellerId || d.assignedSdrId === activeSellerId;
        if (!matchesOwner) return false;
      }
      if (regionFilter !== 'all') {
        const reg = regions.find(r => r.id === regionFilter);
        if (!reg || !d.location?.state || !reg.states.includes(d.location.state)) return false;
      }
      return true;
    });

    // Filtra Atividades
    const fActs = activities.filter(a => {
      if (productFilter !== 'all' && a.productId !== productFilter) return false;
      if (activeSellerId !== 'all' && a.userId !== activeSellerId) return false;
      return true;
    });

    // Filtra Ledger de moedas
    const fLedger = coinLedger.filter(tx => {
      if (activeSellerId !== 'all' && tx.userId !== activeSellerId) return false;
      return true;
    });

    // Deals criados no período
    const createdDeals = fDeals.filter(d => {
      const dt = parseDate(d.createdAt);
      return dt && dt >= targetStartDate;
    });

    // Deals fechados no período
    const wonDeals = fDeals.filter(d => {
      const dt = parseDate(d.updatedAt);
      const isWon = d.status === 'won' || d.stage === 'inaugurado' || d.stage === 'instalacao_realizada';
      return isWon && dt && dt >= targetStartDate;
    });

    const lostDeals = fDeals.filter(d => {
      const dt = parseDate(d.updatedAt);
      return (d.status === 'lost' || d.stage === 'perdeu') && dt && dt >= targetStartDate;
    });

    const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const winRate = Math.round((wonDeals.length / Math.max(1, wonDeals.length + lostDeals.length)) * 100);
    const averageTicket = wonDeals.length > 0 ? Math.round(totalRevenue / wonDeals.length) : 0;
    
    // Moedas
    const coinsEarned = fLedger
      .filter(tx => tx.amount > 0 && (!tx.createdAt || parseDate(tx.createdAt)! >= targetStartDate))
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Atividades concluídas no período
    const periodActs = fActs.filter(a => {
      const dt = parseDate(a.createdAt);
      return dt && dt >= targetStartDate;
    });

    // Contagem por canal
    const actsEmail = periodActs.filter(a => a.type === 'email' && a.status === 'completed').length;
    const actsLinkedin = periodActs.filter(a => a.type === 'linkedin' && a.status === 'completed').length;
    const actsWhatsapp = periodActs.filter(a => a.type === 'whatsapp' && a.status === 'completed').length;
    const actsCall = periodActs.filter(a => a.type === 'call' && a.status === 'completed').length;
    const totalDoneActs = periodActs.filter(a => a.status === 'completed').length;
    const cadenceCompletion = Math.round((totalDoneActs / Math.max(1, periodActs.length)) * 100);

    // Reuniões e visitas agendadas — mesmas regras do Dashboard e do kpiAggregator:
    // reunião é ATIVIDADE `meeting` do período; visita é deal hoje em etapa de visita.
    // (Antes "reuniões" eram deals criados no período com `visitType`, isto é,
    // handoffs; e visitas ignoravam todo card criado antes do período.)
    const meetingsScheduled = periodActs.filter(a => a.type === 'meeting').length;
    const visitsScheduled = fDeals.filter(d => ['visita_agendada', 'degustacao_agendada', 'degustacao_realizada'].includes(d.stage)).length;
    const visitsDone = wonDeals.filter(d => d.visitDoneAt).length;
    const proposalsPresented = fDeals.filter(d => d.stage === 'proposta' || d.stage === 'proposta_ap').length;
    const contractsSigned = wonDeals.filter(d => d.stage === 'contrato' || d.status === 'won').length;
    const pdvsConquered = wonDeals.length;

    // Regiões geográficas
    const stateCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};
    fDeals.forEach(d => {
      if (d.location?.state) {
        stateCounts[d.location.state] = (stateCounts[d.location.state] || 0) + 1;
      }
      if (d.location?.city) {
        cityCounts[d.location.city] = (cityCounts[d.location.city] || 0) + 1;
      }
    });

    return {
      dealsCreated: createdDeals.length,
      dealsWon: wonDeals.length,
      dealsLost: lostDeals.length,
      revenue: totalRevenue,
      conversionRate: winRate,
      ticket: averageTicket,
      coins: coinsEarned,
      activities: periodActs.length,
      activitiesCompleted: totalDoneActs,
      cadenceRate: cadenceCompletion,
      actsEmail,
      actsLinkedin,
      actsWhatsapp,
      actsCall,
      meetingsScheduled,
      visitsScheduled,
      visitsDone,
      proposalsPresented,
      contractsSigned,
      pdvsConquered,
      stateCounts,
      cityCounts
    };
  }, [deals, activities, coinLedger, productFilter, activeSellerId, regionFilter, targetStartDate]);

  // ── Dados dos Funis Dinâmicos ──
  const funnelData = useMemo(() => {
    // Escolhe o funil de acordo com o produto
    const wizFunnels = funnels.filter(f => productFilter === 'all' || f.productId === productFilter);
    if (wizFunnels.length === 0) return [];

    // Agrupa deals do período por estágio dos funis ativos
    return wizFunnels.map(funnel => {
      const stagesList = funnel.stages || [];
      const stagesWithCounts = stagesList.map(st => {
        const count = deals.filter(d => 
          d.funnelId === funnel.id && 
          d.stage === st.id && 
          (!d.createdAt || parseDate(d.createdAt)! >= targetStartDate)
        ).length;
        return {
          name: st.name,
          count
        };
      });

      // Calcula conversão cumulativa
      let maxCount = Math.max(...stagesWithCounts.map(s => s.count), 1);
      const data = stagesWithCounts.map(s => ({
        ...s,
        pct: Math.round((s.count / maxCount) * 100)
      }));

      return {
        id: funnel.id,
        name: funnel.name,
        color: funnel.color,
        stages: data
      };
    });
  }, [funnels, deals, productFilter, targetStartDate]);

  // ── Distribuição Regional Bubble Map ──
  const regionBubbleCounts = useMemo(() => {
    return regions.map(reg => {
      const count = deals.filter(d => {
        if (productFilter !== 'all' && d.productId !== productFilter) return false;
        if (activeSellerId !== 'all' && d.owner !== activeSellerId && d.assignedRepId !== activeSellerId) return false;
        return d.location?.state && reg.states.includes(d.location.state);
      }).length;
      return {
        ...reg,
        count
      };
    });
  }, [deals, productFilter, activeSellerId]);

  // ── Ações de Links de TV ──
  const handleGenerateLink = async (deviceName: string, allowedMetrics: string[], duration: string, productId: string, rankingPeriod: string = 'week') => {
    // O nó `/public_tv/{token}` é público: o token é o único segredo. 128 bits
    // de `crypto` — `Math.random` era previsível e agora o nó pode ter nomes.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = 'tv_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const now = new Date();
    let expires = 'Nunca expira';
    if (duration !== 'Nunca expira') {
      const days = parseInt(duration);
      const expDate = new Date();
      expDate.setDate(now.getDate() + days);
      expires = expDate.toLocaleDateString('pt-BR');
    }

    const newLink: any = {
      token,
      deviceName,
      created: now.toLocaleDateString('pt-BR'),
      expires,
      active: true,
      allowedMetrics,
      productId,
      rankingPeriod
    };

    try {
      await addDocument(newLink);
      setModalOpen(false);
    } catch (err) {
      console.error("Erro ao gerar link de TV display:", err);
    }
  };

  const handleRevoke = async (id: string) => {
    if (confirm('Deseja revogar e excluir este display de TV?')) {
      try {
        await deleteDocument(id);
      } catch (err) {
        console.error("Erro ao revogar token de TV:", err);
      }
    }
  };

  const maskToken = (tok: string, isVisible: boolean) => {
    if (isVisible) return tok;
    return tok.substring(0, 5) + '••••••••••••';
  };

  const handleCopyLink = (tok: string) => {
    const fullUrl = `${window.location.origin}/tv/${tok}`;
    navigator.clipboard.writeText(fullUrl);
    alert('Link público copiado! Pronto para ser exibido em TVs ou painéis.');
  };

  // ── Renderização das visualizações de Dashboard ──

  // helpers inline para o leaderboard
  const sdrTableRows = () => users.filter(u => u.role === 'sdr').map(u => {
    const goal = userGoals.find(g => g.userId === u.id || g.id === u.id);
    const dailyGoal = goal?.activitiesPerDay ?? 4;
    const actsDone = activities.filter(a => a.userId === u.id && a.status === 'completed').length;
    const meetings = activities.filter(a => a.userId === u.id && a.type === 'meeting').length;
    const pct = dailyGoal > 0 ? Math.min(100, Math.round((actsDone / dailyGoal) * 100)) : 0;
    const barColor = pct >= 100 ? '#1A6B1A' : pct >= 60 ? '#D97706' : '#EF4444';
    return (
      <tr key={u.id}>
        <td><div className="row" style={{ gap: 7 }}><Av initials={u.initials} color={u.color} size={22} /><span style={{ fontSize: 12, fontWeight: 600 }}>{u.name.split(' ')[0]}</span></div></td>
        <td><span style={{ fontWeight: 800, color: barColor, fontSize: 12 }}>{actsDone}</span></td>
        <td><span className="muted" style={{ fontSize: 11 }}>{dailyGoal}</span></td>
        <td style={{ minWidth: 70 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-2)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width .5s' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{pct}%</span>
          </div>
        </td>
        <td><span style={{ fontSize: 12 }}>{meetings}</span></td>
      </tr>
    );
  });

  const repTableRows = () => users.filter(u => u.role === 'rep').map(u => {
    const goal = userGoals.find(g => g.userId === u.id || g.id === u.id);
    const visitGoal = goal?.visitsPerMonth ?? 10;
    const conquestGoal = goal?.conquestsPerMonth ?? 2;
    const myDeals = deals.filter(d => d.assignedRepId === u.id || d.owner === u.id);
    const visits = myDeals.filter(d => (d.cohortKeys as any)?.visitScheduledMonth).length;
    const pdvs = myDeals.filter(d => d.status === 'won').reduce((s, d) => s + ((d as any).conquestValue ?? 1), 0);
    const vPct = visitGoal > 0 ? Math.min(100, Math.round((visits / visitGoal) * 100)) : 0;
    const pPct = conquestGoal > 0 ? Math.min(100, Math.round((pdvs / conquestGoal) * 100)) : 0;
    return (
      <tr key={u.id}>
        <td><div className="row" style={{ gap: 7 }}><Av initials={u.initials} color={u.color} size={22} /><span style={{ fontSize: 12, fontWeight: 600 }}>{u.name.split(' ')[0]}</span></div></td>
        <td><span style={{ fontWeight: 800, color: vPct >= 100 ? '#1A6B1A' : 'var(--text-1)', fontSize: 12 }}>{visits}</span></td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-2)', borderRadius: 2, minWidth: 36 }}>
              <div style={{ height: '100%', width: `${vPct}%`, background: vPct >= 100 ? '#1A6B1A' : '#3B82F6', borderRadius: 2, transition: 'width .5s' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{vPct}%</span>
          </div>
        </td>
        <td><span style={{ fontWeight: 800, color: pPct >= 100 ? '#1A6B1A' : 'var(--text-1)', fontSize: 12 }}>{pdvs} PDVs</span></td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-2)', borderRadius: 2, minWidth: 36 }}>
              <div style={{ height: '100%', width: `${pPct}%`, background: pPct >= 100 ? '#1A6B1A' : '#8B5CF6', borderRadius: 2, transition: 'width .5s' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{pPct}%</span>
          </div>
        </td>
      </tr>
    );
  });

  // 1. Visão consolidada da Gestão
  const renderGestaoDashboard = () => {
    // Mapa de visitas por estado
    const visitsByState: Record<string, number> = {};
    deals
      .filter(d => ['visita_agendada', 'degustacao_agendada', 'degustacao_realizada'].includes(d.stage) || (d.cohortKeys as any)?.visitScheduledMonth)
      .filter(d => productFilter === 'all' || d.productId === productFilter)
      .forEach(d => {
        const uf = (d as any).uf ?? d.location?.state;
        if (uf) visitsByState[uf] = (visitsByState[uf] ?? 0) + 1;
      });
    const totalVisits = Object.values(visitsByState).reduce((a, b) => a + b, 0);

    return (
    <>
      {/* ── Linha 1: 8 cards em 1 linha ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10 }}>
        <StatCard label="Negócios Criados"    value={String(kpis.dealsCreated)}                        sub="novos leads"          icon="Briefcase"   themeColor={currentThemeColor} />
        <StatCard label="Faturamento"          value={fmtCurrencyCompact(kpis.revenue)}                sub="conquistado"          icon="Trophy"       themeColor="#F59E0B" />
        <StatCard label="Negócios Ganhos"      value={String(kpis.dealsWon)}                           sub="PDVs ativos"          icon="CheckCircle"  themeColor="var(--primary)" />
        <StatCard label="Conversão"            value={`${kpis.conversionRate}%`}                       sub="win rate"             icon="TrendingUp"   themeColor="#8B5CF6" />
        <StatCard label="Ticket Médio"         value={fmtCurrencyCompact(kpis.ticket)}                 sub="por fechamento"       icon="DollarSign"   themeColor="#10B981" />
        <StatCard label="Ciclo de Venda"       value="21 dias"                                         sub="prospecção → fecho"   icon="Clock"        themeColor="#6B7280" />
        <StatCard label="Moedas"               value={`${kpis.coins} 🪙`}                             sub="distribuídas"         icon="Coins"        themeColor="#D97706" />
        <StatCard label="Tarefas"              value={`${kpis.activitiesCompleted}/${kpis.activities}`} sub={`${kpis.cadenceRate}% ok`} icon="CheckSquare" themeColor="#0E7490" />
      </div>

      {/* ── Linha 2: Mapa região + Funil (scroll) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Coluna esquerda: mapa de regiões + faturamento comparativo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-hd" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="Map" size={15} color="var(--primary)" />
                <h3 style={{ fontSize: 13.5 }}>Vendas por Região</h3>
              </div>
              {regionFilter !== 'all' && (
                <button className="btn btn-outline btn-sm" onClick={() => setRegionFilter('all')}>
                  <Icon name="RefreshCw" size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, alignItems: 'center' }}>
              <svg viewBox="0 0 360 270" style={{ width: '100%', height: 180 }}>
                <line x1="90" y1="50" x2="170" y2="110" stroke="rgba(0,0,0,0.07)" strokeWidth={1.5} />
                <line x1="280" y1="70" x2="170" y2="110" stroke="rgba(0,0,0,0.07)" strokeWidth={1.5} />
                <line x1="220" y1="150" x2="170" y2="110" stroke="rgba(0,0,0,0.07)" strokeWidth={1.5} />
                <line x1="220" y1="150" x2="170" y2="220" stroke="rgba(0,0,0,0.07)" strokeWidth={1.5} />
                {regionBubbleCounts.map(reg => {
                  const isSelected = regionFilter === reg.id;
                  const bubbleSize = reg.count > 0 ? reg.r + Math.min(reg.count * 4, 15) : 12;
                  return (
                    <g key={reg.id} style={{ cursor: 'pointer' }} onClick={() => setRegionFilter(isSelected ? 'all' : reg.id)}>
                      <circle cx={reg.x} cy={reg.y} r={bubbleSize} fill={reg.color} fillOpacity={isSelected ? 0.35 : 0.15} stroke={reg.color} strokeWidth={isSelected ? 3 : 1.5} style={{ transition: 'all 0.3s' }} />
                      <circle cx={reg.x} cy={reg.y} r={4} fill={reg.color} />
                      <text x={reg.x} y={reg.y - bubbleSize - 5} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: 'var(--text-1)' }}>{reg.name}</text>
                      <text x={reg.x} y={reg.y + 4} textAnchor="middle" style={{ fontSize: 9, fontWeight: 800, fill: reg.color }}>{reg.count}</text>
                    </g>
                  );
                })}
              </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: 11.5, marginBottom: 6, color: 'var(--text-1)' }}>Cidades Principais</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {Object.entries(kpis.cityCounts).slice(0, 4).map(([city, count]) => (
                    <div key={city} className="row" style={{ justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{city}</span>
                      <span style={{ color: currentThemeColor, fontWeight: 800 }}>{count}</span>
                    </div>
                  ))}
                  {Object.keys(kpis.cityCounts).length === 0 && <span className="muted" style={{ fontSize: 11 }}>Sem dados no período.</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Faturamento comparativo compacto */}
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>WizMart vs Smart Café</h3>
            </div>
            <div className="row" style={{ gap: 18 }}>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRODUCT_COLOR.wizmart.primary }} />
                  <span style={{ fontSize: 11, fontWeight: 600 }} className="muted">WizMart</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtCurrency(filteredRevenue('wizmart'))}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRODUCT_COLOR.smart_cafe.primary }} />
                  <span style={{ fontSize: 11, fontWeight: 600 }} className="muted">Smart Café</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtCurrency(filteredRevenue('smart_cafe'))}</div>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: '#f1f3f5', overflow: 'hidden', display: 'flex' }}>
              {revenueRatio().wiz > 0 && <div style={{ width: `${revenueRatio().wiz}%`, height: '100%', background: PRODUCT_COLOR.wizmart.primary, transition: 'width 0.4s' }} />}
              {revenueRatio().cafe > 0 && <div style={{ width: `${revenueRatio().cafe}%`, height: '100%', background: PRODUCT_COLOR.smart_cafe.primary, transition: 'width 0.4s' }} />}
            </div>
          </div>
        </div>

        {/* Coluna direita: funil com scroll interno */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-hd">
            <h3 style={{ fontSize: 13.5 }}>Funis de Conversão <span className="badge badge-gray" style={{ fontSize: 10 }}>{funnelData.length} ativos</span></h3>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 380, padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {funnelData.map(funnel => (
              <div key={funnel.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 11.5, color: funnel.color, borderLeft: `3px solid ${funnel.color}`, paddingLeft: 7 }}>
                  {funnel.name}
                </div>
                {funnel.stages.map((st, i) => (
                  <div key={i} className="row" style={{ gap: 10 }}>
                    <span style={{ width: 90, fontSize: 10.5, color: 'var(--text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={st.name}>
                      {st.name}
                    </span>
                    <div style={{ flex: 1, height: 16, background: '#f1f3f5', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ width: `${st.pct}%`, height: '100%', background: `linear-gradient(90deg, ${funnel.color}, ${funnel.color}88)`, borderRadius: 3, transition: 'width 0.4s ease' }} />
                      <span style={{ position: 'absolute', right: 6, top: 1, fontSize: 9.5, fontWeight: 800, color: st.pct > 50 ? '#fff' : 'var(--text-2)' }}>
                        {st.count} ({st.pct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {funnelData.length === 0 && <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Nenhum funil configurado.</div>}
          </div>
        </div>
      </div>

      {/* ── Linha 3: SDR + Rep + Mapa Brasil lado a lado ── */}
      {isManagement && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

          <div className="card">
            <div className="card-hd"><h3 style={{ fontSize: 13.5 }}>SDRs — Atividades vs. Meta</h3></div>
            <table className="tbl">
              <thead><tr>{['SDR','Feitas','Meta/dia','%','Reun.'].map(h => <th key={h} style={{ fontSize: 10.5 }}>{h}</th>)}</tr></thead>
              <tbody>{sdrTableRows()}</tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-hd"><h3 style={{ fontSize: 13.5 }}>Reps — Visitas e PDVs vs. Meta</h3></div>
            <table className="tbl">
              <thead><tr>{['Rep','Visitas','Meta V.','PDVs','Meta PDV'].map(h => <th key={h} style={{ fontSize: 10.5 }}>{h}</th>)}</tr></thead>
              <tbody>{repTableRows()}</tbody>
            </table>
          </div>

          {totalVisits > 0 ? (
            <div className="card">
              <div className="card-hd" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 13.5 }}>Mapa de Visitas</h3>
                <span className="badge badge-gray">{totalVisits} visitas</span>
              </div>
              <div style={{ padding: '4px 12px 12px' }}>
                <BrazilMapSVG visitsByState={visitsByState} height={220} />
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-hd"><h3 style={{ fontSize: 13.5 }}>Mapa de Visitas</h3></div>
              <div style={{ padding: '24px 16px', textAlign: 'center' }} className="muted">
                <Icon name="MapPin" size={28} color="var(--border)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12 }}>Nenhuma visita no período</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Linha 4: Leaderboards lado a lado ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div className="card-hd">
            <h3 style={{ fontSize: 13.5 }} className="row"><Icon name="Zap" size={14} color="#FFE08A" /> Ranking Geral de Pontos</h3>
          </div>
          <table className="tbl">
            <thead><tr>{['Membro','Streak','Pontos'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {users.filter(u => u.role !== 'viewer').sort((a,b) => (b.points||0)-(a.points||0)).slice(0,5).map((u,i) => (
                <tr key={u.id} className={i%2?'alt':''}>
                  <td>
                    <div className="row" style={{ gap: 7 }}>
                      <Av initials={u.initials} color={u.color} size={22} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{u.name}</span>
                      <span className="badge badge-gray" style={{ fontSize: 8.5 }}>{ROLE_LABEL[u.role]}</span>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>🔥 {u.streak||0}d</td>
                  <td style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 13 }}>{(u.points||0).toLocaleString('pt-BR')} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd">
            <h3 style={{ fontSize: 13.5 }} className="row"><Icon name="Coins" size={14} color="#D97706" /> Ranking de Moedas do Ciclo</h3>
          </div>
          <table className="tbl">
            <thead><tr>{['Membro','Nível','Moedas'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {users.filter(u => u.role !== 'viewer').sort((a,b) => (b.coinBalance||0)-(a.coinBalance||0)).slice(0,5).map((u,i) => (
                <tr key={u.id} className={i%2?'alt':''}>
                  <td>
                    <div className="row" style={{ gap: 7 }}>
                      <Av initials={u.initials} color={u.color} size={22} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{u.name}</span>
                      <span className="badge badge-gray" style={{ fontSize: 8.5 }}>{ROLE_LABEL[u.role]}</span>
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>Nível {u.level||1}</td>
                  <td style={{ color: '#D97706', fontWeight: 800, fontSize: 13 }}>{u.coinBalance||0} 🪙</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
    );
  };

  // Helper para faturamento comparativo
  const filteredRevenue = (prod: 'wizmart' | 'smart_cafe') => {
    return deals
      .filter(d => 
        d.productId === prod && 
        (d.status === 'won' || d.stage === 'inaugurado' || d.stage === 'instalacao_realizada') &&
        d.updatedAt && parseDate(d.updatedAt)! >= targetStartDate
      )
      .reduce((sum, d) => sum + (d.value || 0), 0);
  };

  const revenueRatio = () => {
    const wiz = filteredRevenue('wizmart');
    const cafe = filteredRevenue('smart_cafe');
    const tot = wiz + cafe;
    if (tot === 0) return { wiz: 50, cafe: 50 };
    return {
      wiz: Math.round((wiz / tot) * 100),
      cafe: Math.round((cafe / tot) * 100)
    };
  };

  // 2. Visão do SDR
  const renderSdrDashboard = () => (
    <div className="grid-cols-split-responsive">
      {/* KPIs da Fila */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700 }}>Conclusão da Cadência Diária</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Arc pct={kpis.cadenceRate} size={110} strokeColor={currentThemeColor} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)' }}>{kpis.cadenceRate}%</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {kpis.activitiesCompleted} de {kpis.activities} tarefas realizadas
              </div>
            </div>
          </div>
        </div>

        <div className="grid-cols-2-responsive">
          <StatCard label="Meetings Agendados" value={String(kpis.meetingsScheduled)} icon="Calendar" themeColor={currentThemeColor} />
          <StatCard label="Visitas Agendadas" value={String(kpis.visitsScheduled)} icon="MapPin" themeColor="#8B5CF6" />
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700 }}>Moedas do Ciclo</h3>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#D97706' }}>{activeSellerUser?.coinBalance || 0} 🪙</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Acumuladas no Ciclo {currentCycle()}
            </div>
          </div>
        </div>
      </div>

      {/* Detalhamento das Atividades */}
      <div className="card">
        <div className="card-hd">
          <h3 style={{ fontSize: 14 }}>Atividades por Canal</h3>
        </div>
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fff' }}>
          {([
            ['email', 'Mail', 'E-mails Enviados', kpis.actsEmail, '#1A6B1A'],
            ['linkedin', 'Linkedin', 'LinkedIn Conexões', kpis.actsLinkedin, '#0077B5'],
            ['whatsapp', 'MessageSquare', 'WhatsApp Mensagens', kpis.actsWhatsapp, '#25D366'],
            ['call', 'Phone', 'Ligações Efetuadas', kpis.actsCall, '#F59E0B']
          ] as Array<[string, string, string, number, string]>).map(([k, icon, name, val, color]) => {
            const pct = Math.round((val / Math.max(1, kpis.activitiesCompleted)) * 100);
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="font-semibold row" style={{ gap: 8 }}>
                    <Icon name={icon} size={14} color={color} /> {name}
                  </span>
                  <span style={{ fontWeight: 800 }}>{val}</span>
                </div>
                <div style={{ height: 6, background: '#f1f3f5', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 3. Visão do Representante
  const renderRepDashboard = () => (
    <div className="grid-cols-4-responsive">
      <StatCard label="Visitas Realizadas" value={String(kpis.visitsDone)} icon="CheckSquare" themeColor={currentThemeColor} />
      <StatCard label="Propostas Apresentadas" value={String(kpis.proposalsPresented)} icon="FileText" themeColor="#8B5CF6" />
      <StatCard label="Contratos Assinados" value={String(kpis.contractsSigned)} icon="Award" themeColor="var(--primary)" />
      <StatCard label="PDVs Conquistados" value={String(kpis.pdvsConquered)} icon="Trophy" themeColor="#F59E0B" />
      
      <div style={{ gridColumn: 'span 4', marginTop: 4 }} className="grid-cols-split-responsive">
        <div className="card">
          <div className="card-hd">
            <h3 style={{ fontSize: 14 }}>Faturamento Comercial Conquistado</h3>
          </div>
          <div className="card-pad" style={{ background: '#fff', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: currentThemeColor }}>{fmtCurrency(kpis.revenue)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Referente aos negócios fechados e PDVs ativos no período selecionado.
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700 }}>Minha Carteira</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#D97706' }}>{activeSellerUser?.coinBalance || 0} 🪙</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Saldo atual para resgates na loja comercial de prêmios.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const currentCycle = (): string => {
    const d = new Date();
    const quarter = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${quarter}-${d.getFullYear()}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      
      {/* Restrição de Perfil Admin se aplicável */}
      {isManagement && (
        <div style={{ background: 'var(--primary-light)', borderLeft: '4px solid var(--primary)', borderRadius: '0 8px 8px 0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="ShieldCheck" size={18} color="var(--primary)" />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--primary-hover)' }}>
            Acesso Restrito — Controle KPIs de Gestão Comercial
          </span>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="h1">Estatísticas & Performance</h1>
        
        {/* Controles de Filtro */}
        <div className="row" style={{ gap: 12 }}>
          {/* Filtro Período */}
          <div className="seg">
            {(['Hoje', 'Semana', 'Mês', 'Trimestre'] as const).map(p => (
              <button
                key={p}
                className={period === p ? 'on' : ''}
                onClick={() => setPeriod(p)}
                style={{ fontSize: 12 }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Filtro Produto (Gestor) */}
          {isManagement && (
            <select
              className="input"
              value={productFilter}
              onChange={e => setProductFilter(e.target.value as any)}
              style={{ width: 140, height: 35, padding: '0 8px', fontSize: 12.5 }}
            >
              <option value="all">Todos Produtos</option>
              <option value="wizmart">WizMart</option>
              <option value="smart_cafe">Smart Café</option>
            </select>
          )}

          {/* Filtro Vendedor (Gestor) */}
          {isManagement && (
            <select
              className="input"
              value={sellerFilter}
              onChange={e => { setSellerFilter(e.target.value); setRegionFilter('all'); }}
              style={{ width: 160, height: 35, padding: '0 8px', fontSize: 12.5 }}
            >
              <option value="all">Equipe Inteira</option>
              {users.filter(u => u.role !== 'viewer').map(u => (
                <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role]})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Renderização do Dashboard adequado */}
      {loadingDeals || loadingActivities ? (
        <div className="card card-pad text-center py-10" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div className="sk" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          <span className="muted">Carregando métricas comerciais...</span>
        </div>
      ) : activeSellerId === 'all' ? (
        renderGestaoDashboard()
      ) : activeSellerUser?.role === 'rep' ? (
        renderRepDashboard()
      ) : (
        renderSdrDashboard()
      )}

      {/* Seção Links para TV */}
      {isManagement && (
        <div className="card" style={{ border: `1px solid ${currentThemeColor}` }}>
          <div className="card-hd" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name="MonitorPlay" size={18} color={currentThemeColor} />
              <h3 style={{ fontSize: 14.5 }}>Gerenciador de Displays de TV Recepção</h3>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)} style={{ background: currentThemeColor }}>
              <Icon name="Plus" size={15} />
              Gerar Link de TV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {['Display / Dispositivo', 'Filtro Produto', 'Token (UUID)', 'Gerado em', 'Expira em', 'Métricas', 'Status', 'Ações'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingLinks ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center' }} className="muted">
                      Carregando canais ativos...
                    </td>
                  </tr>
                ) : tvLinks.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 34, textAlign: 'center' }} className="muted">
                      Nenhum display público de TV configurado. Gere um link para exibir na recepção.
                    </td>
                  </tr>
                ) : (
                  tvLinks.map(l => {
                    const isVisible = visibleTokenId === (l as any).id;
                    const prodLabel = (l as any).productId === 'wizmart' ? 'WizMart' : (l as any).productId === 'smart_cafe' ? 'Smart Café' : 'Todos';
                    return (
                      <tr key={(l as any).id}>
                        <td style={{ fontWeight: 700 }}>
                          <span className="row" style={{ gap: 7 }}>
                            <Icon name="Tv" size={15} color={currentThemeColor} />
                            {(l as any).deviceName}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-gray" style={{ fontSize: 10 }}>
                            {prodLabel}
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <code style={{ fontSize: 12, background: '#f1f3f5', padding: '2px 7px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
                              {maskToken(l.token, isVisible)}
                            </code>
                            <button
                              className="icon-btn"
                              style={{ width: 24, height: 24 }}
                              onClick={() => setVisibleTokenId(isVisible ? null : ((l as any).id || null))}
                            >
                              <Icon name={isVisible ? 'EyeOff' : 'Eye'} size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>{(l as any).created}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{(l as any).expires}</td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                            {(l as any).allowedMetrics?.map((m: string) => (
                              <span
                                key={m}
                                className={`badge ${m === 'financeiro_real' ? 'badge-danger' : 'badge-accent'}`}
                                style={{ fontSize: 9.5 }}
                              >
                                {m === 'financeiro_real' ? 'Finanças' : m === 'meta_pct' ? 'Metas %' : m === 'ranking_pontos' ? 'Pontos' : m === 'ranking_moedas' ? 'Moedas' : m === 'ganhos_hoje_count' ? 'Ganhos' : m === 'agenda_origem' ? 'Agenda' : m === 'ranking_sdr' ? 'SDRs' : 'Tarefas'}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${l.active ? 'badge-primary' : 'badge-danger'}`}>
                            {l.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleCopyLink(l.token)}
                            >
                              <Icon name="Copy" size={12} />
                              Copiar Link
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleRevoke((l as any).id || '')}
                            >
                              <Icon name="Trash2" size={12} />
                              Revogar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Configuração de TV */}
      {modalOpen && (
        <GenLinkModal
          onClose={() => setModalOpen(false)}
          onGenerate={handleGenerateLink}
        />
      )}
    </div>
  );
}

export default KPIsPage;
