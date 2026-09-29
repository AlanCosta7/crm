import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import { SdrRankingPanel } from './SdrRankingPanel';

// Arco de progresso circular SVG para exibição de tarefas
function Arc({ pct, size = 150, strokeColor = '#8DB600' }: { pct: number; size?: number; strokeColor?: string }) {
  const r = (size - 22) / 2;
  const c = 2 * Math.PI * r;
  const offVal = c * (1 - pct / 100);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={11} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={11}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offVal}
        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
      />
    </svg>
  );
}

export function TVPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [clock, setClock] = useState(() => new Date());
  const [tvData, setTvData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Relógio ativo no topo da tela de TV
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Assinatura em tempo real via WebSocket do RTDB no nó public_tv
  useEffect(() => {
    if (!token) return;
    
    setLoading(true);
    setError('');
    const tvRef = ref(rtdb, `public_tv/${token}`);

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (val) {
        setTvData(val);
        setError('');
      } else {
        setTvData(null);
        setError('Canal de TV não encontrado ou expirado.');
      }
      setLoading(false);
    };

    onValue(tvRef, handleValue, (error) => {
      console.error("[TVPage] Erro ao assinar canal de TV no RTDB:", error);
      setTvData(null);
      // A regra do RTDB nega a leitura de um link vencido (PLANO_DESENHO_CRM_2.md,
      // B6) — chega aqui como PERMISSION_DENIED, não como snapshot vazio.
      setError(
        error?.code === 'PERMISSION_DENIED'
          ? 'Canal de TV não encontrado ou expirado.'
          : 'Não foi possível conectar ao canal de TV.',
      );
      setLoading(false);
    });

    return () => {
      off(tvRef, 'value', handleValue);
    };
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0A1F0A', color: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 42, display: 'block', marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📺</span>
          <div style={{ color: '#7da87d' }}>Sincronizando canal de exibição pública...</div>
        </div>
      </div>
    );
  }

  if (error || !tvData) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0A1F0A', color: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <Icon name="TvMinimal" size={42} color="#8DB600" />
          <div style={{ marginTop: 16, fontWeight: 700 }}>{error || 'Canal indisponível.'}</div>
        </div>
      </div>
    );
  }

  // ── Determinação do Tema de Cores do Produto ──
  const productId = tvData.productId || 'all';
  const themeColors = productId === 'smart_cafe' 
    ? { primary: '#92400E', accent: '#D97706', bgLight: '#23150C', border: 'rgba(217,119,6,0.35)', bgDark: '#170E08', textHighlight: '#D97706', textMuted: '#A78B71', gradient: 'linear-gradient(90deg, #92400E, #D97706)' }
    : productId === 'wizmart'
    ? { primary: '#1A6B1A', accent: '#8DB600', bgLight: '#0F2B0F', border: 'rgba(26,107,26,0.35)', bgDark: '#0A1F0A', textHighlight: '#8DB600', textMuted: '#7da87d', gradient: 'linear-gradient(90deg, #1A6B1A, #8DB600)' }
    : { primary: '#059669', accent: '#34D399', bgLight: '#0C2B20', border: 'rgba(52,211,153,0.35)', bgDark: '#061F17', textHighlight: '#34D399', textMuted: '#76A896', gradient: 'linear-gradient(90deg, #059669, #34D399)' };

  const hh = clock.toLocaleTimeString('pt-BR');
  const allowed = tvData?.allowedMetrics || [];
  const hasFinance = allowed.includes('financeiro_real');

  const cardStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: themeColors.bgLight,
    border: `1.5px solid ${themeColors.border}`,
    borderRadius: 14,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    ...extra
  });

  const capStyle = {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '.8px',
    color: themeColors.textMuted,
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  };

  const kpis = tvData?.live_kpis || { monthRevenue: 0, monthGoal: 1, todayDeals: 0, todayRevenue: 0 };
  const sellersList = tvData?.sellers || [];
  const tasksObj = tvData?.tasks || { done: 0, total: 1 };
  // Agenda do mês com quebra por origem (slides 2 e 10). Vem `null` quando o
  // canal não tem a métrica `agenda_origem` — o tvHelper nem envia o dado.
  const agenda = tvData?.agenda ?? null;
  const showAgenda = allowed.includes('agenda_origem') && agenda !== null;
  const rankingRaw = tvData?.leaderboard || [];
  // Ranking de SDRs (Fase B do PLANO_DESENHO_CRM_2). `null` sem a métrica
  // `ranking_sdr` — o tvHelper nem envia o dado nesse caso.
  const sdrRanking = tvData?.ranking_sdr ?? null;
  const showSdrRanking = allowed.includes('ranking_sdr') && sdrRanking !== null;
  // Link só de ranking = tela cheia; misturado com outras métricas vira card.
  const onlySdrRanking = showSdrRanking && allowed.every((m: string) => m === 'ranking_sdr');

  const metaPct = Math.round((kpis.monthRevenue / kpis.monthGoal) * 100);

  // Helper para processar e ordenar rankings
  const getSortedRanking = (type: 'points' | 'coins') => {
    const arr = Array.isArray(rankingRaw)
      ? rankingRaw
      : Object.entries(rankingRaw).map(([id, value]: [string, any]) => ({
        id,
        ...value,
      }));

    if (type === 'points') {
      return [...arr]
        .sort((a: any, b: any) => (b.pts || 0) - (a.pts || 0))
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
    } else {
      return [...arr]
        .sort((a: any, b: any) => (b.coinBalance || 0) - (a.coinBalance || 0))
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
    }
  };

  const showPoints = allowed.includes('ranking_pontos');
  const showCoins = allowed.includes('ranking_moedas');

  const pointsRanking = getSortedRanking('points');
  const coinsRanking = getSortedRanking('coins');

  return (
    <div style={{ position: 'absolute', inset: 0, background: themeColors.bgDark, color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      
      {/* Header da TV */}
      <div style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: `1px solid ${themeColors.border}`, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="mark" style={{ width: 32, height: 32, borderRadius: 8, background: themeColors.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={productId === 'smart_cafe' ? 'Coffee' : 'ShoppingCart'} size={16} color="#fff" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>
            {productId === 'smart_cafe' ? (
              <>
                <span style={{ color: '#fff' }}>Smart </span>
                <span style={{ color: themeColors.accent, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>café</span>
              </>
            ) : (
              <>
                <span style={{ color: themeColors.accent }}>Wiz</span>
                <span style={{ color: '#fff' }}>Mart</span>
              </>
            )}
            <span style={{ fontSize: 12, fontWeight: 500, color: themeColors.textMuted, marginLeft: 10 }}>| {tvData?.tenantName || 'Canal Corporativo'}</span>
          </span>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <span style={{ color: themeColors.textMuted, fontSize: 13.5, fontWeight: 600 }}>
            <span className="live-indicator" style={{ color: themeColors.accent, marginRight: 7 }}>⬤</span>
            AO VIVO · Atualizado às {hh}
          </span>
          <button
            onClick={() => navigate('/kpi')}
            style={{ background: 'rgba(255,255,255,.08)', color: themeColors.textMuted, border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
          >
            Sair
          </button>
        </div>
      </div>

      {onlySdrRanking ? (
        <div style={{ flex: 1, minHeight: 0, padding: 20 }}>
          <div style={cardStyle({ height: '100%' })}>
            <SdrRankingPanel data={sdrRanking} theme={themeColors} defaultPeriod={tvData?.rankingPeriod} />
          </div>
        </div>
      ) : (
      /* Grid de Cards 3x3 */
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'minmax(0, 1.2fr) minmax(0, 1.3fr) auto', gap: 16, padding: 20 }}>
        
        {/* Card 1 — Meta do Mês */}
        {allowed.includes('meta_pct') ? (
          <div style={cardStyle({ gridColumn: 'span 2', justifyContent: 'center' })}>
            <div style={capStyle}>
              <Icon name="TrendingUp" size={16} color={themeColors.accent} />
              Meta de Vendas do Mês ({productId === 'wizmart' ? 'WizMart' : productId === 'smart_cafe' ? 'Smart Café' : 'Todos'})
            </div>
            {hasFinance ? (
              <>
                <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', color: '#fff' }}>
                  R$ {kpis.monthRevenue.toLocaleString('pt-BR')}
                </div>
                <div style={{ color: themeColors.textMuted, fontSize: 15, marginTop: 6, fontWeight: 600 }}>
                  Meta da filial: R$ {kpis.monthGoal.toLocaleString('pt-BR')}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em', color: themeColors.accent }}>
                {metaPct}% Atingido
              </div>
            )}
            <div style={{ height: 14, borderRadius: 8, background: 'rgba(255,255,255,.08)', overflow: 'hidden', margin: '16px 0 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: `${Math.min(metaPct, 100)}%`, height: '100%', background: themeColors.gradient, borderRadius: 8, transition: 'width 1s ease-in-out' }} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13.5 }}>
              <span style={{ color: themeColors.accent, fontWeight: 800 }}>{metaPct}% da meta concluída</span>
              {hasFinance && (
                <span style={{ color: '#F59E0B', fontWeight: 700 }}>
                  Faltam R$ {Math.max(0, kpis.monthGoal - kpis.monthRevenue).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={cardStyle({ gridColumn: 'span 2', alignItems: 'center', justifyContent: 'center' })} className="muted">
            <Icon name="Lock" size={26} color={themeColors.textMuted} />
            <div style={{ marginTop: 8, fontSize: 13.5 }}>Métricas de meta desabilitadas neste display.</div>
          </div>
        )}

        {/* Card 2 — Ganhos Hoje */}
        {allowed.includes('ganhos_hoje_count') ? (
          <div style={cardStyle({ justifyContent: 'center', alignItems: 'flex-start' })}>
            <div style={capStyle}>
              <Icon name="Trophy" size={16} color={themeColors.accent} />
              Negócios Fechados Hoje
            </div>
            <div style={{ fontSize: 72, fontWeight: 800, color: themeColors.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {kpis.todayDeals}
            </div>
            {hasFinance && (
              <div style={{ color: themeColors.textMuted, fontSize: 18, marginTop: 6, fontWeight: 700 }}>
                R$ {kpis.todayRevenue.toLocaleString('pt-BR')}
              </div>
            )}
          </div>
        ) : (
          <div style={cardStyle({ alignItems: 'center', justifyContent: 'center' })} className="muted">
            <Icon name="Lock" size={26} color={themeColors.textMuted} />
            <div style={{ marginTop: 8, fontSize: 13.5 }}>Ganhos diários bloqueados.</div>
          </div>
        )}

        {/* Card 3 — Ganhos por Vendedor */}
        <div style={cardStyle({ gridColumn: 'span 2' })}>
          <div style={capStyle}>
            <Icon name="Users" size={16} color={themeColors.accent} />
            Desempenho Comercial do Time
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, justifyContent: 'center', flex: 1 }}>
            {sellersList.slice(0, 4).map((s: any, i: number) => (
              <div key={i} className="row" style={{ gap: 12 }}>
                <span style={{ width: 140, fontSize: 14.5, color: '#fff', fontWeight: 600 }}>{s.name}</span>
                <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,.07)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct || 0}%`, height: '100%', background: themeColors.gradient, borderRadius: 5, transition: 'width 1s ease-in-out' }} />
                </div>
                <span style={{ width: 120, textAlign: 'right', color: themeColors.accent, fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 14.5 }}>
                  {hasFinance ? `R$ ${(s.val || 0).toLocaleString('pt-BR')}` : `${s.pct || 0}% meta`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4 — Progresso de Tarefas Arc */}
        {allowed.includes('tarefas') ? (
          <div style={cardStyle({ alignItems: 'center', justifyContent: 'center' })}>
            <div style={{ ...capStyle, alignSelf: 'flex-start' }}>
              <Icon name="CheckSquare" size={16} color={themeColors.accent} />
              Tarefas Concluídas
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Arc pct={Math.round((tasksObj.done / (tasksObj.total || 1)) * 100)} size={150} strokeColor={themeColors.accent} />
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>
                  {tasksObj.done} / {tasksObj.total}
                </div>
                <div style={{ color: themeColors.textMuted, fontSize: 12.5, marginTop: 4, fontWeight: 600 }}>
                  {Math.round((tasksObj.done / (tasksObj.total || 1)) * 100)}% concluído
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={cardStyle({ alignItems: 'center', justifyContent: 'center' })} className="muted">
            <Icon name="Lock" size={26} color={themeColors.textMuted} />
            <div style={{ marginTop: 8, fontSize: 13.5 }}>Visualização de tarefas bloqueada.</div>
          </div>
        )}

        {/* Card 4.5 — Reuniões e Visitas do mês com origem (slides 2 e 10) */}
        {showAgenda && (
          <div style={cardStyle({ gridColumn: 'span 3' })}>
            <div style={capStyle}>
              <Icon name="CalendarCheck" size={16} color={themeColors.accent} />
              Agenda do Mês — Inbound × Outbound
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 6 }}>
              {([
                { label: 'Reuniões Agendadas', d: agenda.meetings },
                { label: 'Visitas Agendadas',  d: agenda.visits   },
              ] as const).map(({ label, d }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ color: themeColors.textMuted, fontSize: 13, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>
                    {d?.total ?? 0}
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: '#7FB3FF' }}>{d?.inbound ?? 0} Inbound</span>
                    <span style={{ color: themeColors.accent }}>{d?.outbound ?? 0} Outbound</span>
                    {d?.unresolved ? (
                      <span style={{ color: themeColors.textMuted }}>{d.unresolved} sem origem</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Card 5 — Leaderboards Flexíveis */}
        {showPoints || showCoins ? (
          <div style={cardStyle({ gridColumn: 'span 3', padding: '14px 24px' })}>
            <div style={capStyle}>
              <Icon name="Zap" size={16} color="#FFE08A" />
              Leaderboards Comerciais ao Vivo
            </div>
            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0, width: '100%', justifyContent: 'center' }}>
              
              {/* Leaderboard de Pontos */}
              {showPoints && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: themeColors.textMuted, marginBottom: 4 }}>
                    🏆 Ranking Geral de Pontos
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center' }}>
                    {pointsRanking.slice(0, 3).map((p: any, i: number) => {
                      const isFirst = i === 0;
                      return (
                        <div
                          key={p.id}
                          className="row"
                          style={{
                            gap: 12,
                            padding: '4px 14px',
                            borderRadius: 8,
                            background: isFirst ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.02)',
                            border: isFirst ? `1px solid ${themeColors.accent}55` : '1px solid transparent',
                          }}
                        >
                          <span style={{ width: 18, fontWeight: 900, fontSize: 15, color: isFirst ? '#fff' : themeColors.textMuted }}>
                            {p.rank}
                          </span>
                          <Av initials={p.initials} color={isFirst ? themeColors.accent : p.color} size={26} />
                          <span style={{ flex: 1, fontWeight: isFirst ? 700 : 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                            {isFirst && <span style={{ marginLeft: 6 }}>👑</span>}
                          </span>
                          <span style={{ color: themeColors.textMuted, fontSize: 12, width: 110, fontWeight: 600 }}>
                            🔥 {p.streak || 0} dias
                          </span>
                          <span style={{ fontWeight: 800, fontSize: 15, color: isFirst ? '#fff' : themeColors.accent, fontVariantNumeric: 'tabular-nums', width: 80, textAlign: 'right' }}>
                            {(p.pts || 0).toLocaleString('pt-BR')} pts
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Leaderboard de Moedas */}
              {showCoins && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: themeColors.textMuted, marginBottom: 4 }}>
                    🪙 Ranking de Moedas (Q Atual)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center' }}>
                    {coinsRanking.slice(0, 3).map((p: any, i: number) => {
                      const isFirst = i === 0;
                      return (
                        <div
                          key={p.id}
                          className="row"
                          style={{
                            gap: 12,
                            padding: '4px 14px',
                            borderRadius: 8,
                            background: isFirst ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.02)',
                            border: isFirst ? '1px solid #D9770655' : '1px solid transparent',
                          }}
                        >
                          <span style={{ width: 18, fontWeight: 900, fontSize: 15, color: isFirst ? '#fff' : themeColors.textMuted }}>
                            {p.rank}
                          </span>
                          <Av initials={p.initials} color={isFirst ? '#D97706' : p.color} size={26} />
                          <span style={{ flex: 1, fontWeight: isFirst ? 700 : 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                            {isFirst && <span style={{ marginLeft: 6 }}>🪙</span>}
                          </span>
                          <span style={{ color: themeColors.textMuted, fontSize: 12, width: 110, fontWeight: 600 }}>
                            Nível {p.level || 'Pro'}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: 15, color: '#D97706', fontVariantNumeric: 'tabular-nums', width: 80, textAlign: 'right' }}>
                            {p.coinBalance || 0} 🪙
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div style={cardStyle({ gridColumn: 'span 3', alignItems: 'center', justifyContent: 'center' })} className="muted">
            <Icon name="Lock" size={26} color={themeColors.textMuted} />
            <div style={{ marginTop: 8, fontSize: 13.5 }}>Leaderboards ocultos neste display.</div>
          </div>
        )}

        {/* Card — Ranking do Time de SDRs (Fase B do PLANO_DESENHO_CRM_2) */}
        {showSdrRanking && (
          <div style={cardStyle({ gridColumn: 'span 3' })}>
            <SdrRankingPanel data={sdrRanking} theme={themeColors} defaultPeriod={tvData?.rankingPeriod} />
          </div>
        )}

      </div>
      )}
    </div>
  );
}

export default TVPage;
