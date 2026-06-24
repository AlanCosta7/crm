/**
 * LojaPage.tsx — Loja de Prêmios (Feira Digital)
 *
 * Exibe o catálogo de prêmios com filtro por categoria.
 * O usuário pode resgatar prêmios se tiver saldo suficiente.
 *
 * Seções:
 *  - Header com saldo atual e ciclo
 *  - Filtros: Todos / Vouchers / Produtos / Experiências
 *  - Grid de prêmios com foto, nome, custo, estoque e botão de resgate
 *  - RedeemModal de confirmação
 *  - Histórico de resgates do usuário
 */

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Prize, CoinRedemption } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { validateRedemption, formatCoins, getCurrentCycleInfo } from '../../utils/coinUtils';
import { fmtTimestamp } from '../../utils/crmFormat';
import { matchesProductId } from '../../utils/productScope';

// ── RedeemModal ───────────────────────────────────────────────────────────────
interface RedeemModalProps {
  prize: Prize;
  balance: number;
  onConfirm: (deliveryInfo: string) => Promise<void>;
  onCancel: () => void;
}

function RedeemModal({ prize, balance, onConfirm, onCancel }: RedeemModalProps) {
  const [deliveryInfo, setDeliveryInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const needsDelivery = prize.category === 'produto';
  const remaining     = balance - prize.coinCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsDelivery && !deliveryInfo.trim()) {
      setError('Informe o endereço de entrega.');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(deliveryInfo.trim());
    } catch (err: any) {
      setError(err.message || 'Erro ao resgatar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Confirmar Resgate</h3>
          <button className="icon-btn" onClick={onCancel}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Resumo do prêmio */}
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {prize.category === 'voucher' ? '🎟️' : prize.category === 'produto' ? '📦' : '✨'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{prize.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{prize.description}</div>
              </div>
            </div>

            {/* Confirmação de saldo */}
            <div style={{ padding: '12px 14px', borderRadius: 8, background: remaining >= 0 ? '#DCFCE7' : '#FEE2E2', border: `1px solid ${remaining >= 0 ? '#86EFAC' : '#FECACA'}` }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>Saldo atual</span>
                <span style={{ fontWeight: 700 }}>{formatCoins(balance)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                <span>Custo do prêmio</span>
                <span style={{ fontWeight: 700, color: '#EF4444' }}>−{formatCoins(prize.coinCost)}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ fontWeight: 700 }}>Saldo após resgate</span>
                <span style={{ fontWeight: 800, color: remaining >= 0 ? '#16A34A' : '#EF4444' }}>{formatCoins(remaining)}</span>
              </div>
            </div>

            {/* Endereço de entrega (para produtos físicos) */}
            {needsDelivery && (
              <div className="field" style={{ margin: 0 }}>
                <div className="fl">Endereço de entrega *</div>
                <textarea
                  className="input" rows={2}
                  placeholder="Rua, número, complemento, bairro, cidade, CEP..."
                  value={deliveryInfo}
                  onChange={e => { setDeliveryInfo(e.target.value); setError(''); }}
                  style={{ resize: 'none' }}
                />
              </div>
            )}

            {prize.category === 'voucher' && (
              <p className="muted" style={{ fontSize: 12 }}>
                O voucher será enviado por e-mail após a confirmação pelo gestor.
              </p>
            )}

            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>{error}</div>
            )}
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#D97706', border: 'none' }}>
              <span style={{ fontSize: 16 }}>🪙</span>
              {saving ? 'Resgatando...' : `Resgatar por ${prize.coinCost} moeda${prize.coinCost !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PrizeModalProps {
  prize?: Prize | null;
  onSave: (prizeData: Omit<Prize, 'id'>) => Promise<void>;
  onCancel: () => void;
}

function PrizeModal({ prize, onSave, onCancel }: PrizeModalProps) {
  const [name, setName] = useState(prize?.name ?? '');
  const [description, setDescription] = useState(prize?.description ?? '');
  const [coinCost, setCoinCost] = useState(prize?.coinCost ?? 10);
  const [stock, setStock] = useState(prize?.stock ?? -1);
  const [category, setCategory] = useState<'voucher' | 'produto' | 'experiencia'>(prize?.category ?? 'voucher');
  const [productId, setProductId] = useState<string>(prize?.productId ?? 'all');
  const [imageUrl, setImageUrl] = useState(prize?.imageUrl ?? '');
  const [isActive, setIsActive] = useState(prize?.isActive ?? true);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do prêmio é obrigatório.');
      return;
    }
    if (coinCost < 0) {
      setError('O custo em moedas não pode ser negativo.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        coinCost,
        stock,
        category,
        productId: productId as any,
        imageUrl: imageUrl.trim(),
        isActive,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar o prêmio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{prize ? 'Editar Prêmio' : 'Novo Prêmio'}</h3>
          <button type="button" className="icon-btn" onClick={onCancel}><Icon name="X" size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            
            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Nome do Prêmio *</div>
              <input
                className="input"
                required
                placeholder="Ex: Voucher iFood R$ 50"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="row" style={{ gap: 12 }}>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <div className="fl">Custo em Moedas *</div>
                <input
                  className="input"
                  type="number"
                  required
                  min={0}
                  value={coinCost}
                  onChange={e => setCoinCost(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <div className="fl">Estoque (-1 = ilimitado) *</div>
                <input
                  className="input"
                  type="number"
                  required
                  min={-1}
                  value={stock}
                  onChange={e => setStock(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="row" style={{ gap: 12 }}>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <div className="fl">Categoria *</div>
                <select
                  className="input"
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                >
                  <option value="voucher">🎟️ Voucher</option>
                  <option value="produto">📦 Produto</option>
                  <option value="experiencia">✨ Experiência</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <div className="fl">Escopo de Produto *</div>
                <select
                  className="input"
                  value={productId}
                  onChange={e => setProductId(e.target.value)}
                >
                  <option value="all">Todos os Produtos</option>
                  <option value="wizmart">WizMart</option>
                  <option value="smart_cafe">Smart Café</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Descrição</div>
              <textarea
                className="input"
                rows={2}
                placeholder="Detalhes sobre o prêmio e instruções de resgate..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl">URL da Imagem (opcional)</div>
              <input
                className="input"
                placeholder="https://exemplo.com/foto.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </div>

            <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="prize-active-checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="prize-active-checkbox" style={{ fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}>
                Prêmio Ativo (disponível para resgate)
              </label>
            </div>

            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>{error}</div>
            )}
          </div>
          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#D97706', border: 'none' }}>
              <Icon name="Check" size={16} />
              {saving ? 'Salvando...' : 'Salvar Prêmio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ── PrizeCard ─────────────────────────────────────────────────────────────────
interface PrizeCardProps {
  prize: Prize;
  balance: number;
  onRedeem: (p: Prize) => void;
  onEdit?: (p: Prize) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}

function PrizeCard({ prize, balance, onRedeem, onEdit, onDelete, isAdmin }: PrizeCardProps) {
  const validation = validateRedemption(balance, prize.coinCost, prize.stock);
  const stockLabel = prize.stock === -1 ? 'Ilimitado' : prize.stock === 0 ? 'Esgotado' : `${prize.stock} disponíveis`;
  const EMOJI: Record<string, string> = { voucher: '🎟️', produto: '📦', experiencia: '✨' };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: !validation.canRedeem ? 0.85 : 1 }}>
      {/* Imagem / placeholder */}
      <div style={{ height: 130, background: prize.imageUrl ? `url(${prize.imageUrl}) center/cover` : 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, position: 'relative' }}>
        {!prize.imageUrl && EMOJI[prize.category]}

        {isAdmin && (
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit?.(prize); }}
              className="icon-btn"
              title="Editar Prêmio"
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Pencil" size={13} color="var(--text-primary)" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); prize.id && onDelete?.(prize.id); }}
              className="icon-btn"
              title="Excluir Prêmio"
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Trash2" size={13} color="#EF4444" />
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {prize.name}
            {!prize.isActive && (
              <span className="badge" style={{ fontSize: 10, background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA', padding: '1px 5px' }}>
                Inativo
              </span>
            )}
          </div>
          <span className="badge" style={{ fontSize: 11, background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', flexShrink: 0 }}>
            {prize.category === 'voucher' ? 'Voucher' : prize.category === 'produto' ? 'Produto' : 'Experiência'}
          </span>
        </div>

        <p className="muted" style={{ fontSize: 12.5, margin: 0, flex: 1 }}>{prize.description}</p>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: prize.stock === 0 ? '#EF4444' : 'var(--text-2)' }}>{stockLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: 16, color: '#D97706' }}>
            {prize.coinCost}
            <span style={{ fontSize: 14 }}>🪙</span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', background: validation.canRedeem ? '#D97706' : 'var(--bg-2)', color: validation.canRedeem ? '#fff' : 'var(--text-2)', border: 'none', cursor: validation.canRedeem ? 'pointer' : 'not-allowed' }}
          disabled={!validation.canRedeem}
          onClick={() => validation.canRedeem && onRedeem(prize)}
          title={validation.reason}
        >
          {!validation.canRedeem
            ? (prize.stock === 0 ? 'Esgotado' : 'Saldo insuficiente')
            : 'Resgatar'}
        </button>
      </div>
    </div>
  );
}

// ── LojaPage ──────────────────────────────────────────────────────────────────
export function LojaPage() {
  const { user } = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const [filter,   setFilter]   = useState<'todos' | 'voucher' | 'produto' | 'experiencia'>('todos');
  const [redeeming, setRedeeming] = useState<Prize | null>(null);
  const [editingPrize, setEditingPrize] = useState<Prize | null | undefined>(undefined);
  const [successMsg, setSuccessMsg] = useState('');

  const { data: prizes }     = useFirestoreCollection<Prize>('prizes');
  const { data: redemptions }= useFirestoreCollection<CoinRedemption>('coin_redemptions');
  const { addDocument: addPrize, updateDocument: updatePrize, deleteDocument: deletePrize } = useFirestoreMutations('prizes');

  const balance   = user?.coinBalance ?? 0;
  const cycle     = getCurrentCycleInfo();
  const isAdmin   = user?.role === 'master' || user?.role === 'manager';

  const activePrizes = prizes.filter(p => {
    if (!p.isActive && !isAdmin) return false;
    if (!matchesProductId(productScope, p.productId || 'all')) return false;
    if (filter !== 'todos' && p.category !== filter) return false;
    return true;
  });

  const handleSavePrize = async (prizeData: Omit<Prize, 'id'>) => {
    if (editingPrize) {
      await updatePrize(editingPrize.id!, prizeData);
    } else {
      await addPrize(prizeData);
    }
    setEditingPrize(undefined);
    setSuccessMsg(editingPrize ? '✅ Prêmio editado com sucesso!' : '✅ Novo prêmio adicionado com sucesso!');
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleDeletePrize = async (prizeId: string) => {
    if (!confirm('Tem certeza de que deseja excluir este prêmio do catálogo?')) return;
    try {
      await deletePrize(prizeId);
      setSuccessMsg('✅ Prêmio excluído com sucesso!');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      alert('Erro ao excluir prêmio: ' + err.message);
    }
  };

  const myRedemptions = redemptions
    .filter(r => r.userId === user?.uid && matchesProductId(productScope, r.productId || 'wizmart'))
    .slice(0, 5);

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    requested:  { label: 'Solicitado',       color: '#F59E0B' },
    processing: { label: 'Em processamento', color: '#0E7490' },
    delivered:  { label: 'Entregue',         color: '#16A34A' },
    cancelled:  { label: 'Cancelado',        color: '#EF4444' },
  };

  const handleRedeem = async (prize: Prize, deliveryInfo: string) => {
    const fn = httpsCallable(functions, 'redeemCoins');
    const result = await fn({ prizeId: prize.id, tenantId: user?.tenantId, deliveryInfo });
    const data = result.data as any;
    setRedeeming(null);
    setSuccessMsg(`✅ "${data.prizeName}" resgatado com sucesso! Você tem agora ${formatCoins(data.remainingBalance)}.`);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="h1">🏪 Loja de Prêmios</h1>
          <p className="muted" style={{ marginTop: 2 }}>{cycle.label} · Seu saldo: <strong style={{ color: '#D97706' }}>{formatCoins(balance)}</strong></p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditingPrize(null)}
            className="btn btn-primary"
            style={{ background: '#D97706', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="Plus" size={15} />
            Adicionar Prêmio
          </button>
        )}
      </div>

      {/* Mensagem de sucesso */}
      {successMsg && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: '#DCFCE7', border: '1px solid #86EFAC', fontSize: 13, fontWeight: 600, color: '#166534' }}>
          {successMsg}
        </div>
      )}

      {/* Filtros de categoria */}
      <div className="chips">
        {([
          ['todos', 'Todos'],
          ['voucher', '🎟️ Vouchers'],
          ['produto', '📦 Produtos'],
          ['experiencia', '✨ Experiências'],
        ] as const).map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {/* Grid de prêmios */}
      {activePrizes.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
            {filter === 'todos' ? 'Nenhum prêmio disponível' : 'Nenhum prêmio nesta categoria'}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>O gestor ainda não cadastrou prêmios na loja.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {activePrizes.map(prize => (
            <PrizeCard
              key={prize.id}
              prize={prize}
              balance={balance}
              onRedeem={setRedeeming}
              onEdit={setEditingPrize}
              onDelete={handleDeletePrize}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Meus resgates recentes */}
      {myRedemptions.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Meus resgates recentes</h3>
          <div className="card">
            {myRedemptions.map((r, i) => {
              const sc = STATUS_CONFIG[r.status] || { label: r.status, color: '#6B7280' };
              return (
                <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < myRedemptions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.prizeName}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{fmtTimestamp((r as any).createdAt)} · {r.coinAmount} moedas</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${sc.color}18`, color: sc.color }}>
                    {sc.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de resgate */}
      {redeeming && (
        <RedeemModal
          prize={redeeming}
          balance={balance}
          onConfirm={deliveryInfo => handleRedeem(redeeming, deliveryInfo)}
          onCancel={() => setRedeeming(null)}
        />
      )}

      {/* Modal de prêmio (criar/editar) */}
      {editingPrize !== undefined && (
        <PrizeModal
          prize={editingPrize}
          onSave={handleSavePrize}
          onCancel={() => setEditingPrize(undefined)}
        />
      )}
    </div>
  );
}

export default LojaPage;
