import { useState, useEffect, useRef } from 'react';
import anime from 'animejs';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import type { LeaderboardUser } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { useUIStore } from '../../stores/uiStore';

interface ClientAchievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  max: number;
}

const ACHIEVEMENTS_DEFINITIONS: ClientAchievement[] = [
  { id: 'first-contact', icon: 'Zap', name: 'Primeiro Contato', desc: 'Conclua a primeira tarefa no CRM', max: 1 },
  { id: 'streak-5', icon: 'Flame', name: '5 Dias Seguidos', desc: 'Mantenha um streak de 5 dias seguidos com atividades', max: 5 },
  { id: 'meetings-10', icon: 'Calendar', name: '10 Reuniões', desc: 'Agende e realize 10 reuniões com clientes', max: 10 },
  { id: 'whats-10', icon: 'MessageSquare', name: 'WhatsApp Pro', desc: 'Envie 10 mensagens de WhatsApp para clientes', max: 10 },
  { id: 'emails-20', icon: 'Mail', name: 'Email Champion', desc: 'Envie 20 e-mails para clientes', max: 20 },
  { id: 'coins-50', icon: 'Coins', name: 'Acumulador', desc: 'Acumule 50 moedas em sua carteira', max: 50 },
  { id: 'centurion', icon: 'ShieldCheck', name: 'Centurião', desc: 'Conclua 100 tarefas ou atividades no total', max: 100 }
];

export function LeaderboardPage() {
  const [period, setPeriod] = useState<'Semana' | 'Mês' | 'Trimestre'>('Semana');
  const [leaderboardType, setLeaderboardType] = useState<'pts' | 'coins'>('pts');
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const [productFilter, setProductFilter] = useState<'all' | 'wizmart' | 'smart_cafe'>(productScope);
  const [activeTab, setActiveTab] = useState<'ranking' | 'achievements'>('ranking');

  const { data: lb, loading } = useLeaderboard();
  const { user } = useAuthStore();

  useEffect(() => {
    setProductFilter(productScope);
  }, [productScope]);

  // Encontra estatísticas do usuário logado na classificação ou monta fallback
  const userStats = lb.find(p => p.id === user?.uid || p.id === user?.email) || {
    pts: user?.points || 0,
    coinBalance: user?.coinBalance || 0,
    emails: 0,
    whats: 0,
    meetings: 0,
    streak: user?.streak || 0,
    rank: 99,
  };

  // Cálculo de conquistas do usuário logado
  const getAchievementProgress = (id: string) => {
    switch (id) {
      case 'first-contact': {
        const unlocked = userStats.pts > 0;
        return { unlocked, current: unlocked ? 1 : 0, pct: unlocked ? 100 : 0 };
      }
      case 'streak-5': {
        const current = userStats.streak || 0;
        return { unlocked: current >= 5, current, pct: Math.min(100, (current / 5) * 100) };
      }
      case 'meetings-10': {
        const current = userStats.meetings || 0;
        return { unlocked: current >= 10, current, pct: Math.min(100, (current / 10) * 100) };
      }
      case 'whats-10': {
        const current = userStats.whats || 0;
        return { unlocked: current >= 10, current, pct: Math.min(100, (current / 10) * 100) };
      }
      case 'emails-20': {
        const current = userStats.emails || 0;
        return { unlocked: current >= 20, current, pct: Math.min(100, (current / 20) * 100) };
      }
      case 'coins-50': {
        const current = userStats.coinBalance || 0;
        return { unlocked: current >= 50, current, pct: Math.min(100, (current / 50) * 100) };
      }
      case 'centurion': {
        const current = (userStats.emails || 0) + (userStats.whats || 0) + (userStats.meetings || 0);
        return { unlocked: current >= 100, current, pct: Math.min(100, (current / 100) * 100) };
      }
      default:
        return { unlocked: false, current: 0, pct: 0 };
    }
  };

  // Trilha de desbloqueios em tempo real para exibir Toasts na sessão
  const prevUnlockedRef = useRef<string[]>([]);
  useEffect(() => {
    const currentlyUnlocked = ACHIEVEMENTS_DEFINITIONS
      .filter(def => getAchievementProgress(def.id).unlocked)
      .map(def => def.id);

    if (prevUnlockedRef.current.length === 0) {
      // Primeira carga: registra as conquistas já desbloqueadas para evitar duplicar toasts
      prevUnlockedRef.current = currentlyUnlocked;
    } else {
      // Identifica novas conquistas desbloqueadas nesta sessão
      const newlyUnlocked = currentlyUnlocked.filter(id => !prevUnlockedRef.current.includes(id));
      if (newlyUnlocked.length > 0) {
        newlyUnlocked.forEach(id => {
          const def = ACHIEVEMENTS_DEFINITIONS.find(d => d.id === id);
          if (def) {
            useToastStore.getState().addToast({
              type: 'achievement',
              message: 'Conquista Desbloqueada! 🏆',
              sub: `Você desbloqueou a medalha: ${def.name}`,
              achievementIcon: def.icon,
            });
          }
        });
        prevUnlockedRef.current = currentlyUnlocked;
      }
    }
  }, [userStats.pts, userStats.coinBalance, userStats.emails, userStats.whats, userStats.meetings, userStats.streak]);

  // 1. Filtragem por produto
  const filteredList = lb.filter((item) => {
    if (productFilter === 'all') return true;
    return item.productIds?.includes(productFilter);
  });

  // 2. Ordenação conforme métrica selecionada (Pontos vs Moedas)
  const sortedList = [...filteredList].sort((a, b) => {
    if (leaderboardType === 'coins') {
      return (b.coinBalance || 0) - (a.coinBalance || 0);
    }
    return b.pts - a.pts;
  });

  // 3. Recalculo dos ranks com base no filtro aplicado
  const rankedList: LeaderboardUser[] = sortedList.map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  // Ordenação de pódio para exibir o 1º lugar centralizado: [2º lugar, 1º lugar, 3º lugar]
  const getPodiumList = () => {
    const list = [...rankedList].slice(0, 3);
    const sortedPodium = [];
    if (list.length > 1) sortedPodium.push(list[1]); // 2º lugar esquerdo
    if (list.length > 0) sortedPodium.push(list[0]); // 1º lugar centro
    if (list.length > 2) sortedPodium.push(list[2]); // 3º lugar direito
    return sortedPodium;
  };

  const podium = getPodiumList();

  const getPodSize = (rank: number) => {
    if (rank === 1) return 82;
    if (rank === 2) return 66;
    return 58;
  };

  // Entrada em cascata do pódio e linhas ao receber ou alternar dados
  useEffect(() => {
    if (rankedList.length > 0 && !loading) {
      const stagger = typeof anime.stagger === 'function' ? anime.stagger : () => 0;
      // 1. Subida elástica das colunas do pódio
      anime({
        targets: '.pod-card',
        scale: [0, 1],
        opacity: [0, 1],
        duration: 900,
        delay: stagger(120, { start: 100 }),
        easing: 'easeOutElastic(1, .75)',
        transformOrigin: 'bottom center'
      });

      // 2. Cascata stagger das linhas do ranking
      anime({
        targets: '.leaderboard-row',
        translateY: [20, 0],
        opacity: [0, 1],
        duration: 400,
        delay: stagger(30, { start: 250 }),
        easing: 'easeOutQuad'
      });
    }
  }, [rankedList.length, loading, period, leaderboardType, productFilter, activeTab]);

  const trendEl = (t: number) => {
    if (t > 0) return <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>↑ {t}</span>;
    if (t < 0) return <span style={{ color: 'var(--danger)', fontWeight: 700 }}>↓ {Math.abs(t)}</span>;
    return <span className="muted">–</span>;
  };

  // Totalizador de conquistas obtidas
  const totalAchievements = ACHIEVEMENTS_DEFINITIONS.length;
  const unlockedCount = ACHIEVEMENTS_DEFINITIONS.filter(a => getAchievementProgress(a.id).unlocked).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Subbar do Leaderboard com abas principais */}
      <div className="subbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button 
            className={`btn ${activeTab === 'ranking' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontWeight: 700, fontSize: 14, borderRadius: 8 }}
            onClick={() => setActiveTab('ranking')}
          >
            <Icon name="Trophy" size={16} style={{ marginRight: 6 }} />
            Classificação Comercial
          </button>
          <button 
            className={`btn ${activeTab === 'achievements' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontWeight: 700, fontSize: 14, borderRadius: 8 }}
            onClick={() => setActiveTab('achievements')}
          >
            <Icon name="Award" size={16} style={{ marginRight: 6 }} />
            Galeria de Conquistas
            <span 
              className="badge" 
              style={{ 
                marginLeft: 8, 
                background: activeTab === 'achievements' ? 'rgba(255,255,255,0.2)' : 'var(--primary-light)',
                color: activeTab === 'achievements' ? '#fff' : 'var(--primary)',
                fontWeight: 800
              }}
            >
              {unlockedCount}/{totalAchievements}
            </span>
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Métrica do Leaderboard (Pontos vs Moedas) */}
        {activeTab === 'ranking' && (
          <div className="seg" style={{ display: 'flex', background: 'var(--border)', padding: 3, borderRadius: 8 }}>
            <button
              className={leaderboardType === 'pts' ? 'on' : ''}
              onClick={() => setLeaderboardType('pts')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12.5 }}
            >
              <span>⚡ Pontos</span>
            </button>
            <button
              className={leaderboardType === 'coins' ? 'on' : ''}
              onClick={() => setLeaderboardType('coins')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12.5 }}
            >
              <span>🪙 Moedas</span>
            </button>
          </div>
        )}

        {/* Filtro de Produtos */}
        {activeTab === 'ranking' && (
          <div className="seg" style={{ display: 'flex', background: 'var(--border)', padding: 3, borderRadius: 8 }}>
            {(['all', 'wizmart', 'smart_cafe'] as const).map(prod => (
              <button
                key={prod}
                className={productFilter === prod ? 'on' : ''}
                onClick={() => setProductFilter(prod)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12.5,
                  fontWeight: productFilter === prod ? 700 : 500,
                  color: productFilter === prod 
                    ? (prod === 'wizmart' ? '#1A6B1A' : prod === 'smart_cafe' ? '#B45309' : undefined) 
                    : undefined
                }}
              >
                {prod === 'all' && 'Todos'}
                {prod === 'wizmart' && 'WizMart'}
                {prod === 'smart_cafe' && 'Smart Café'}
              </button>
            ))}
          </div>
        )}

        {/* Período */}
        {activeTab === 'ranking' && (
          <div className="seg">
            {(['Semana', 'Mês', 'Trimestre'] as const).map(p => (
              <button
                key={p}
                className={period === p ? 'on' : ''}
                onClick={() => setPeriod(p)}
                style={{ padding: '4px 10px', fontSize: 12.5 }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }} className="muted">
          Carregando classificação do time...
        </div>
      ) : activeTab === 'ranking' ? (
        /* ================= VISTA DO RANKING ================= */
        <div className="grid-cols-leaderboard-responsive">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Pódio visual de Destaques */}
            {podium.length > 0 && (
              <div 
                className="podium" 
                style={{ 
                  background: productFilter === 'smart_cafe' 
                    ? 'linear-gradient(180deg, rgba(254, 243, 199, 0.25) 0%, rgba(217, 119, 6, 0.05) 100%)' 
                    : 'linear-gradient(180deg, rgba(232, 245, 232, 0.25) 0%, rgba(26, 107, 26, 0.05) 100%)',
                  border: productFilter === 'smart_cafe' 
                    ? '1.5px solid rgba(217,119,6,0.15)' 
                    : '1.5px solid rgba(26,107,26,0.15)',
                  color: 'var(--text)'
                }}
              >
                {podium.map(p => {
                  const sz = getPodSize(p.rank);
                  const isGold = p.rank === 1;
                  const isMe = user?.email === p.id || p.id === 'jv';
                  const displayMetric = leaderboardType === 'coins' 
                    ? `${(p.coinBalance || 0).toLocaleString('pt-BR')} 🪙`
                    : `${p.pts.toLocaleString('pt-BR')} PTS`;

                  return (
                    <div
                      key={p.id}
                      className="pod pod-card"
                      style={{ 
                        paddingBottom: isGold ? 0 : 14, 
                        opacity: 0,
                        position: 'relative',
                        zIndex: isGold ? 2 : 1
                      }}
                    >
                      {isGold && (
                        <div style={{ fontSize: 26, marginBottom: 4, transform: 'rotate(-5deg)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>👑</div>
                      )}
                      <div style={{ position: 'relative' }}>
                        <Av initials={p.initials} size={sz} color={p.color} />
                        <div
                          className="prank"
                          style={{
                            position: 'absolute',
                            bottom: -4,
                            right: -4,
                            border: isMe ? '2.5px solid var(--primary)' : '2px solid rgba(255, 255, 255, 0.7)',
                            background: isGold ? 'var(--warning)' : 'rgba(107,114,128,0.85)',
                            color: '#fff',
                            fontWeight: 900
                          }}
                        >
                          {p.rank}
                        </div>
                      </div>
                      <div className="pname" style={{ marginTop: 8, fontWeight: isMe ? 800 : 600 }}>
                        {p.name.split(' ')[0]}
                        {isMe && <span style={{ fontSize: 10, color: 'var(--primary)' }}> (você)</span>}
                      </div>
                      <div 
                        className="ppts" 
                        style={{ 
                          fontSize: isGold ? 17 : 15, 
                          color: leaderboardType === 'coins' ? '#D97706' : 'var(--primary)',
                          fontWeight: 800
                        }}
                      >
                        {displayMetric}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 700, textTransform: 'lowercase' }}>
                        {leaderboardType === 'coins' ? 'moedas' : 'pontos'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ranking Geral do Time */}
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ width: 45 }}>#</th>
                    <th>Vendedor</th>
                    <th style={{ 
                      fontWeight: leaderboardType === 'pts' ? 800 : 500, 
                      color: leaderboardType === 'pts' ? 'var(--primary)' : 'inherit',
                      background: leaderboardType === 'pts' ? 'rgba(26,107,26,0.03)' : 'inherit'
                    }}>Pontos ⚡</th>
                    <th style={{ 
                      fontWeight: leaderboardType === 'coins' ? 800 : 500, 
                      color: leaderboardType === 'coins' ? '#D97706' : 'inherit',
                      background: leaderboardType === 'coins' ? 'rgba(217,119,6,0.03)' : 'inherit'
                    }}>Moedas 🪙</th>
                    <th>Emails</th>
                    <th>WhatsApps</th>
                    <th>Reuniões</th>
                    <th>Nível</th>
                    <th>Streak</th>
                    <th style={{ width: 60 }}>Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedList.map(p => {
                    const isMe = user?.email === p.id || p.id === 'jv';
                    return (
                      <tr
                        key={p.id}
                        className="leaderboard-row"
                        style={{
                          background: isMe ? 'var(--primary-light)' : undefined,
                          opacity: 0,
                          transform: 'translateY(15px)',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        <td style={{ fontWeight: 800, verticalAlign: 'middle' }}>{p.rank}</td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <div className="row" style={{ gap: 9 }}>
                            <Av initials={p.initials} color={p.color} size={28} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--primary-dark)' : 'var(--text-primary)' }}>
                                {p.name}
                                {isMe && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10, padding: '1px 4px' }}>você</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ 
                          fontWeight: leaderboardType === 'pts' ? 800 : 500,
                          background: leaderboardType === 'pts' ? 'rgba(26,107,26,0.02)' : 'inherit',
                          verticalAlign: 'middle'
                        }}>
                          <span style={{ color: leaderboardType === 'pts' ? 'var(--primary)' : 'inherit' }}>
                            {p.pts.toLocaleString('pt-BR')}
                          </span>
                        </td>
                        <td style={{ 
                          fontWeight: leaderboardType === 'coins' ? 800 : 500,
                          background: leaderboardType === 'coins' ? 'rgba(217,119,6,0.02)' : 'inherit',
                          verticalAlign: 'middle'
                        }}>
                          <span style={{ color: leaderboardType === 'coins' ? '#D97706' : 'inherit' }}>
                            {(p.coinBalance || 0).toLocaleString('pt-BR')}
                          </span>
                        </td>
                        <td className="muted tnum" style={{ verticalAlign: 'middle' }}>{p.emails}</td>
                        <td className="muted tnum" style={{ verticalAlign: 'middle' }}>{p.whats}</td>
                        <td className="muted tnum" style={{ verticalAlign: 'middle' }}>{p.meetings}</td>
                        <td style={{ verticalAlign: 'middle' }}>
                          <span className="badge badge-gray" style={{ fontSize: 11, padding: '2px 8px' }}>{p.level}</span>
                        </td>
                        <td style={{ fontWeight: 700, verticalAlign: 'middle' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            🔥 {p.streak} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>dias</span>
                          </span>
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>{trendEl(p.trend)}</td>
                      </tr>
                    );
                  })}
                  {rankedList.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center' }} className="muted">
                        Nenhum vendedor atende a este filtro de produto.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Painel Lateral de Resumo de Conquistas */}
          <div className="card" style={{ position: 'sticky', top: 18 }}>
            <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="Trophy" size={17} color="var(--primary)" />
                <h3 style={{ fontSize: 14.5 }}>Suas Conquistas</h3>
              </div>
              <button 
                className="btn btn-ghost" 
                style={{ fontSize: 11.5, padding: '2px 6px', color: 'var(--primary)' }}
                onClick={() => setActiveTab('achievements')}
              >
                Ver Todas
              </button>
            </div>
            
            {/* Medidor de progresso de conquistas */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                <span className="muted">Progresso Geral</span>
                <span style={{ color: 'var(--primary)' }}>{Math.round((unlockedCount / totalAchievements) * 100)}%</span>
              </div>
              <div style={{ width: '100%', height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${(unlockedCount / totalAchievements) * 100}%`, 
                    background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                    borderRadius: 4,
                    transition: 'width 0.5s ease-out'
                  }} 
                />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                <Icon name="Check" size={12} color="var(--success-text)" />
                <span>Você completou {unlockedCount} de {totalAchievements} medalhas.</span>
              </div>
            </div>

            {/* Lista resumida */}
            <div className="card-pad" style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                {ACHIEVEMENTS_DEFINITIONS.slice(0, 6).map((a) => {
                  const state = getAchievementProgress(a.id);
                  return (
                    <div 
                      key={a.id} 
                      className={`ach ${state.unlocked ? '' : 'locked'}`} 
                      title={`${a.name}: ${a.desc}`}
                      style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                      onClick={() => setActiveTab('achievements')}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <div 
                        className="icw" 
                        style={{ 
                          position: 'relative', 
                          background: state.unlocked ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg)',
                          border: state.unlocked ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid var(--border)',
                          boxShadow: state.unlocked ? '0 0 10px rgba(139,92,246,0.15)' : 'none'
                        }}
                      >
                        <Icon name={a.icon} size={18} color={state.unlocked ? '#8B5CF6' : '#9aa3af'} />
                        {!state.unlocked && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              background: '#fff',
                              borderRadius: '50%',
                              padding: 2,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Icon name="Lock" size={8} color="#9aa3af" />
                          </span>
                        )}
                      </div>
                      <div className="anm" style={{ fontSize: 10, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{a.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= VISTA DA GALERIA DE CONQUISTAS ================= */
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="Award" size={22} color="var(--primary)" />
              Galeria de Medalhas e Conquistas
            </h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              Desbloqueie conquistas exclusivas concluindo tarefas, gerando streak e acumulando carteira cheia de moedas.
            </p>
          </div>

          {/* Grid detalhado de conquistas */}
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
              gap: 16 
            }}
          >
            {ACHIEVEMENTS_DEFINITIONS.map((a) => {
              const state = getAchievementProgress(a.id);
              return (
                <div
                  key={a.id}
                  style={{
                    background: state.unlocked ? 'rgba(255, 255, 255, 1)' : 'rgba(255,255,255,0.6)',
                    border: state.unlocked ? '1.5px solid rgba(139, 92, 246, 0.25)' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: state.unlocked 
                      ? '0 8px 20px rgba(139, 92, 246, 0.08), 0 1px 3px rgba(0,0,0,0.03)' 
                      : '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    cursor: 'default',
                    opacity: state.unlocked ? 1 : 0.8
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    if (state.unlocked) {
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(139, 92, 246, 0.14), 0 2px 6px rgba(0,0,0,0.05)';
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.45)';
                    } else {
                      e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = state.unlocked 
                      ? '0 8px 20px rgba(139, 92, 246, 0.08), 0 1px 3px rgba(0,0,0,0.03)' 
                      : '0 1px 3px rgba(0,0,0,0.02)';
                    e.currentTarget.style.borderColor = state.unlocked ? 'rgba(139, 92, 246, 0.25)' : 'var(--border)';
                  }}
                >
                  {/* Glow de fundo se desbloqueado */}
                  {state.unlocked && (
                    <div 
                      style={{ 
                        position: 'absolute', 
                        top: -20, 
                        right: -20, 
                        width: 80, 
                        height: 80, 
                        borderRadius: '50%', 
                        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0) 70%)',
                        pointerEvents: 'none'
                      }} 
                    />
                  )}

                  {/* Icone e Nome */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div 
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: state.unlocked 
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.18) 0%, rgba(124, 58, 237, 0.08) 100%)' 
                          : 'var(--bg)',
                        border: state.unlocked ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        position: 'relative'
                      }}
                    >
                      <Icon 
                        name={a.icon} 
                        size={22} 
                        color={state.unlocked ? '#7C3AED' : '#9ca3af'} 
                        style={{ filter: state.unlocked ? 'drop-shadow(0 2px 4px rgba(124, 58, 237, 0.2))' : 'none' }} 
                      />
                      
                      {!state.unlocked && (
                        <div 
                          style={{ 
                            position: 'absolute', 
                            bottom: -3, 
                            right: -3, 
                            background: '#fff', 
                            borderRadius: '50%', 
                            padding: 2, 
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <Icon name="Lock" size={8} color="#9ca3af" />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span 
                        style={{ 
                          fontWeight: 700, 
                          fontSize: 13.5, 
                          color: state.unlocked ? 'var(--text-primary)' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {a.name}
                      </span>
                      <span 
                        className="badge" 
                        style={{ 
                          fontSize: 9.5, 
                          padding: '1px 5px', 
                          marginTop: 2,
                          width: 'fit-content',
                          background: state.unlocked ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg)',
                          color: state.unlocked ? '#10B981' : '#9ca3af',
                          fontWeight: 800
                        }}
                      >
                        {state.unlocked ? 'Desbloqueada' : 'Bloqueada'}
                      </span>
                    </div>
                  </div>

                  {/* Descrição */}
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.35, flex: 1 }}>
                    {a.desc}
                  </p>

                  {/* Barra de progresso */}
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      <span className="muted">Progresso</span>
                      <span style={{ color: state.unlocked ? '#7C3AED' : '#9ca3af' }}>
                        <span>{state.current}/{a.max}</span>
                        <span style={{ marginLeft: 4 }}>({Math.round(state.pct)}%)</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          width: `${state.pct}%`, 
                          background: state.unlocked 
                            ? 'linear-gradient(90deg, #7C3AED, #9333EA)' 
                            : 'linear-gradient(90deg, #9ca3af, #cbd5e1)',
                          borderRadius: 3,
                          transition: 'width 0.5s ease-out'
                        }} 
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaderboardPage;
