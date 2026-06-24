/**
 * CarteiraPage.tsx — Carteira de Moedas do Usuário
 *
 * Exibe:
 *  - Saldo atual com animação de contador
 *  - Informações do ciclo trimestral (label, dias restantes)
 *  - Alerta "Feira Digital" quando faltam ≤ 15 dias
 *  - Estatísticas do ciclo atual (ganhas / resgatadas)
 *  - Histórico de transações com tipo, data e referência
 *  - Filtro por tipo (ganhos / resgates / todos)
 *  - Botão para ir à Loja de Prêmios
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { CoinTransaction } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import {
  getCurrentCycleInfo,
  daysUntilCycleEnd,
  isFairApproaching,
  calcCoinBalance,
  calcCoinsEarnedInCycle,
  calcCoinsRedeemedInCycle,
  formatCoins,
  getCoinEventLabel,
  getCoinEventStyle,
} from '../../utils/coinUtils';
import { fmtTimestamp } from '../../utils/crmFormat';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';

// ── CarteiraPage ──────────────────────────────────────────────────────────────
export function CarteiraPage() {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const [filter, setFilter] = useState<'todos' | 'ganhos' | 'resgates'>('todos');

  const { data: transactions, loading } = useFirestoreCollection<CoinTransaction>('coin_ledger');
  const scopedTransactions = transactions.filter(tx => matchesProductId(productScope, tx.productId || 'wizmart'));

  const cycle      = getCurrentCycleInfo();
  const daysLeft   = daysUntilCycleEnd();
  const fairSoon   = isFairApproaching();
  const balance    = productScope === 'all' ? (user?.coinBalance ?? calcCoinBalance(scopedTransactions)) : calcCoinBalance(scopedTransactions);
  const earned     = calcCoinsEarnedInCycle(scopedTransactions, cycle.key);
  const redeemed   = calcCoinsRedeemedInCycle(scopedTransactions, cycle.key);

  const filteredTx = scopedTransactions
    .filter(tx => {
      if (filter === 'ganhos')   return tx.amount > 0;
      if (filter === 'resgates') return tx.amount < 0;
      return true;
    })
    .sort((a, b) => {
      const dateA: number = (a as any).createdAt?.toDate?.().getTime?.() ?? 0;
      const dateB: number = (b as any).createdAt?.toDate?.().getTime?.() ?? 0;
      return dateB - dateA;
    });

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Carteira de Moedas</h1>
        <div className="sk" style={{ height: 160, borderRadius: 12 }} />
        <div className="sk" style={{ height: 80, borderRadius: 10 }} />
        {[0, 1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 60, borderRadius: 8 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">🪙 Carteira de Moedas</h1>
          <p className="muted" style={{ marginTop: 2 }}>Seu saldo e histórico de transações</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/loja')}>
          <Icon name="ShoppingBag" size={16} />Ir para a Loja
        </button>
      </div>

      {/* Alerta Feira Digital */}
      {fairSoon && (
        <div style={{ padding: '14px 18px', borderRadius: 10, background: '#FFFBEB', border: '2px solid #F59E0B', display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 28 }}>🏪</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#B45309' }}>
              Feira Digital em {daysLeft} dia{daysLeft !== 1 ? 's' : ''}!
            </div>
            <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>
              Você tem <strong>{formatCoins(balance)}</strong> para trocar por prêmios.
              A {cycle.label} termina em breve — não deixe suas moedas sem usar!
            </p>
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto', flexShrink: 0, background: '#F59E0B', border: 'none' }} onClick={() => navigate('/loja')}>
            Ver Prêmios
          </button>
        </div>
      )}

      {/* Cards de saldo e ciclo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Saldo principal */}
        <div className="card card-pad" style={{ background: 'linear-gradient(135deg, #92400E 0%, #B45309 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -30, right: 20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Saldo atual
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 52, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {balance}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>moedas</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>{cycle.label}</div>
        </div>

        {/* Estatísticas do ciclo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card card-pad" style={{ flex: 1, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="TrendingUp" size={20} color="#16A34A" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' }}>Ganhas no ciclo</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', fontVariantNumeric: 'tabular-nums' }}>{earned}</div>
            </div>
          </div>
          <div className="card card-pad" style={{ flex: 1, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="ShoppingBag" size={20} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' }}>Resgatadas</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{redeemed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Prazo do ciclo */}
      <div className="card" style={{ padding: '12px 18px' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{cycle.label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Termina em {daysLeft} dia{daysLeft !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="prog">
          <div className="fill" style={{
            width: `${Math.round((1 - daysLeft / 91) * 100)}%`,
            background: daysLeft <= 15 ? '#F59E0B' : 'var(--primary)',
            transition: 'width 1s ease',
          }} />
        </div>
      </div>

      {/* Histórico de transações */}
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Histórico de transações</h3>
          <div className="chips" style={{ margin: 0 }}>
            {([['todos', 'Todos'], ['ganhos', '+ Ganhos'], ['resgates', '− Resgates']] as const).map(([k, l]) => (
              <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="Coins" size={36} color="#D97706" style={{ margin: '0 auto 12px' }} />
            <div className="muted" style={{ fontWeight: 600 }}>Nenhuma transação encontrada</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Complete atividades no CRM para ganhar suas primeiras moedas!
            </p>
          </div>
        ) : (
          <div className="card">
            {filteredTx.map((tx, i) => {
              const style   = getCoinEventStyle(tx.type);
              const isLast  = i === filteredTx.length - 1;
              const txDate  = (tx as any).createdAt;
              return (
                <div
                  key={tx.id || i}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${style.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={style.icon} size={18} color={style.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{getCoinEventLabel(tx.type)}</div>
                    {tx.note && <div className="muted" style={{ fontSize: 12 }}>{tx.note}</div>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {fmtTimestamp(txDate)} · Ciclo {tx.cycle}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: style.isPositive ? '#16A34A' : '#EF4444', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {style.isPositive ? '+' : ''}{tx.amount}
                    <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 3 }}>🪙</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default CarteiraPage;
