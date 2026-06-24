/**
 * ComissoesPage.tsx — Calculadora e registro de comissões (Fase 3)
 *
 * Fluxo: o gerente escolhe um negócio (Deal) → a tela puxa o produto (SKU) e as
 * "assinaturas do card" (BDR/SDR/Rep) com o nível do SDR → informa o faturamento
 * dos primeiros dias, dias decorridos e as pré-condições → vê o preview do rateio
 * e registra a comissão na coleção `commissions`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { useToastStore } from '../../stores/toastStore';
import { fmtCurrency } from '../../utils/crmFormat';
import {
  PRODUCT_SKU_LABELS,
  type Deal,
  type SettingUser,
  type ProductSKU,
} from '../../types/crm';
import {
  getSkuRule,
  projetarFaturamento,
  avaliarGatilho,
  calcularComissao,
  parcelarPorTeto,
  dataPagamentoDia15,
  isDealComissionavel,
  COMODATO_INSTALLMENT_CAP,
  type CommissionTier,
} from './calc';
import { useComissoes } from './useComissoes';
import type { Commission, CommissionShare } from './types';

const SKU_OPTIONS = Object.keys(PRODUCT_SKU_LABELS) as ProductSKU[];

function diasEntre(iso: string): number {
  if (!iso) return 0;
  const ativ = new Date(iso + 'T00:00:00Z').getTime();
  const hoje = Date.now();
  const d = Math.floor((hoje - ativ) / 86_400_000);
  return d < 0 ? 0 : d;
}

export default function ComissoesPage() {
  const { addToast } = useToastStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: deals } = useFirestoreCollection<Deal>('deals');
  const { data: users } = useFirestoreCollection<SettingUser>('users');
  const { data: filas } = useFirestoreCollection<{ id?: string; cicloKey?: string; priorMonth?: string; items?: any[] }>('commission_queues');
  const { comissoes, criarComissao } = useComissoes();

  const [dealId, setDealId] = useState('');
  const [sku, setSku] = useState<ProductSKU>('wizmart_minimercado');
  const [dataAtivacao, setDataAtivacao] = useState('');
  const [faturamento, setFaturamento] = useState<number>(0);
  const [diasManual, setDiasManual] = useState<number | ''>('');
  const [proporcional, setProporcional] = useState(true);
  const [tabelaCheia, setTabelaCheia] = useState(false);
  const [primeiraFaturaPaga, setPrimeiraFaturaPaga] = useState(false);
  const [tetoParcela, setTetoParcela] = useState(COMODATO_INSTALLMENT_CAP);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const deal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);

  // Só negócios em estágio de conquista (ativados) são elegíveis a comissão.
  const dealsElegiveis = useMemo(
    () => deals.filter(d => isDealComissionavel(d.stage)),
    [deals],
  );

  // Fila de avaliação mais recente (gerada pela Cloud Function no dia 10),
  // ocultando os que já viraram comissão nesta sessão.
  const filaAtual = useMemo(() => {
    const ordenadas = [...filas].sort((a, b) => (a.cicloKey ?? '') < (b.cicloKey ?? '') ? 1 : -1);
    return ordenadas[0];
  }, [filas]);
  const pendentes = useMemo(() => {
    const comissionados = new Set(comissoes.map(c => c.dealId));
    return (filaAtual?.items ?? []).filter((it: any) => !comissionados.has(it.dealId));
  }, [filaAtual, comissoes]);

  // Ao escolher um negócio, herda SKU e assinaturas.
  function selecionarDeal(id: string) {
    setDealId(id);
    const d = deals.find(x => x.id === id);
    if (d?.mainProduct) setSku(d.mainProduct);
  }

  // Pré-seleção via atalho do card do pipeline: /comissoes?deal=<id>
  useEffect(() => {
    const pre = searchParams.get('deal');
    if (pre && deals.some(d => d.id === pre)) {
      selecionarDeal(pre);
      searchParams.delete('deal');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  const userById = (id?: string) => users.find(u => u.id === id);
  const bdr = userById(deal?.bdrId);
  const sdr = userById(deal?.assignedSdrId);
  const rep = userById(deal?.assignedRepId);
  const sdrTier: CommissionTier = (sdr?.commissionTier as CommissionTier) ?? 'junior';

  const rule = getSkuRule(sku);
  const dias = diasManual === '' ? diasEntre(dataAtivacao) : Number(diasManual);

  const projetado = proporcional ? projetarFaturamento(faturamento, dias) : faturamento;
  const faturamentoReferencia = proporcional ? projetado : faturamento;

  const gatilho = avaliarGatilho({ sku, faturamentoReferencia, tabelaCheia, primeiraFaturaPaga });
  // Base do rateio: sempre o valor efetivamente vendido/informado.
  const split = calcularComissao({ sku, base: faturamento, sdrTier });
  const parcelas = rule?.installmentCap ? parcelarPorTeto(split.total, tetoParcela) : [];
  const dataPgto = dataAtivacao ? dataPagamentoDia15(new Date(dataAtivacao + 'T00:00:00Z')) : null;

  const podeRegistrar = !!deal && !!rule && gatilho.atingido && faturamento > 0 && !salvando;

  async function registrar() {
    if (!deal || !rule) return;
    setSalvando(true);
    try {
      const shares: CommissionShare[] = [];
      if (bdr?.id) shares.push({ role: 'bdr', userId: bdr.id, userName: bdr.name, valor: split.bdr });
      if (sdr?.id) shares.push({ role: 'sdr', userId: sdr.id, userName: sdr.name, tier: sdrTier, valor: split.sdr });
      if (rep?.id) shares.push({ role: 'rep', userId: rep.id, userName: rep.name, valor: split.rep });

      const doc: Omit<Commission, 'id'> = {
        dealId: deal.id,
        dealName: deal.name,
        productId: deal.productId,
        sku,
        faturamentoInformado: faturamento,
        diasDecorridos: dias,
        faturamentoProjetado: proporcional ? projetado : undefined,
        baseCalculo: faturamento,
        tabelaCheia: rule.requiresFullPriceTable ? tabelaCheia : undefined,
        primeiraFaturaPaga: rule.requiresFirstInvoice ? primeiraFaturaPaga : undefined,
        proporcional,
        split,
        shares,
        beneficiaryIds: shares.map(s => s.userId),
        parcelas: parcelas.length ? parcelas : undefined,
        dataAtivacao: dataAtivacao || undefined,
        dataPagamento: dataPgto ? dataPgto.toISOString() : undefined,
        status: proporcional ? 'projetada' : 'confirmada',
        observacao: observacao || undefined,
      };

      await criarComissao(doc);
      addToast({ type: 'success', message: 'Comissão registrada', sub: `${deal.name} — ${fmtCurrency(split.total)}` });
      // Reset parcial (mantém o SKU/produto)
      setDealId('');
      setFaturamento(0);
      setObservacao('');
    } catch (e) {
      addToast({ type: 'error', message: 'Falha ao registrar comissão', sub: String(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Calculadora de Comissão</h1>
        <Link to="/comissoes/relatorio" className="btn" style={{ fontSize: 13 }}>Relatório →</Link>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 20 }}>
        Registre o comissionamento por negócio. O rateio usa as assinaturas do card (BDR · SDR · Representante).
      </p>

      {pendentes.length > 0 && (
        <div style={{ background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.25)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
            Fila de avaliação — {pendentes.length} negócio(s) ativado(s) em {filaAtual?.priorMonth} aguardando comissão
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pendentes.map((it: any) => (
              <button key={it.dealId} className="btn" style={{ fontSize: 12.5 }} onClick={() => selecionarDeal(it.dealId)}>
                {it.dealName} →
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Entrada ─────────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Dados</h3>

          <div className="field">
            <div className="fl">Negócio (card)</div>
            <select className="input" value={dealId} onChange={e => selecionarDeal(e.target.value)}>
              <option value="">Selecione…</option>
              {dealsElegiveis.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.company ? ` — ${d.company}` : ''}</option>
              ))}
            </select>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              Apenas negócios ativados (inaugurados/instalados) aparecem aqui.
            </div>
          </div>

          <div className="field">
            <div className="fl">Produto / Modelo</div>
            <select className="input" value={sku} onChange={e => setSku(e.target.value as ProductSKU)}>
              {SKU_OPTIONS.map(s => (
                <option key={s} value={s}>{PRODUCT_SKU_LABELS[s]}</option>
              ))}
            </select>
            {!rule && (
              <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
                Regra de comissão ainda não definida para este produto.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <div className="fl">Data de ativação</div>
              <input type="date" className="input" value={dataAtivacao} onChange={e => setDataAtivacao(e.target.value)} />
            </div>
            <div className="field">
              <div className="fl">Faturamento vendido (R$)</div>
              <input type="number" className="input" min={0} value={faturamento || ''} onChange={e => setFaturamento(Number(e.target.value))} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '6px 0 12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={proporcional} onChange={e => setProporcional(e.target.checked)} />
            Pagamento proporcional (avaliação antecipada do dia 10)
          </label>

          {proporcional && (
            <div className="field">
              <div className="fl">Dias decorridos {diasManual === '' && dataAtivacao ? `(auto: ${dias})` : ''}</div>
              <input type="number" className="input" min={1} placeholder={dataAtivacao ? `auto ${diasEntre(dataAtivacao)}` : 'ex.: 10'}
                value={diasManual} onChange={e => setDiasManual(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          )}

          {rule?.requiresFullPriceTable && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={tabelaCheia} onChange={e => setTabelaCheia(e.target.checked)} />
              Tabela de preços cheia (obrigatória p/ Máquina de Café)
            </label>
          )}

          {rule?.requiresFirstInvoice && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={primeiraFaturaPaga} onChange={e => setPrimeiraFaturaPaga(e.target.checked)} />
              1ª fatura paga (obrigatória p/ Comodato)
            </label>
          )}

          {rule?.installmentCap != null && (
            <div className="field">
              <div className="fl">Teto por parcela (Comodato)</div>
              <input type="number" className="input" min={1} value={tetoParcela} onChange={e => setTetoParcela(Math.max(1, Number(e.target.value)))} />
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                Parcelas geradas automaticamente (cheias no teto + sobra na última).
              </div>
            </div>
          )}

          <div className="field">
            <div className="fl">Observação</div>
            <input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="opcional" />
          </div>
        </div>

        {/* ── Preview ─────────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Resultado</h3>

          {proporcional && (
            <Linha label="Projeção 30 dias" valor={`${fmtCurrency(projetado)}${rule?.gatilho30d != null ? ` (gatilho ${fmtCurrency(rule.gatilho30d)})` : ''}`} />
          )}

          <div style={{
            padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, margin: '4px 0 14px',
            background: gatilho.atingido ? 'rgba(34,160,34,.12)' : 'rgba(185,28,28,.10)',
            color: gatilho.atingido ? 'var(--success, #16a34a)' : 'var(--danger)',
          }}>
            {gatilho.atingido ? '✓ Gatilho atingido — pode comissionar' : `✕ ${gatilho.motivo ?? 'Gatilho não atingido'}`}
          </div>

          <Pessoa label="BDR (2%)" nome={bdr?.name} valor={split.bdr} />
          <Pessoa
            label={rule?.model === 'cafe' ? 'SDR (21%)' : `SDR (${({ junior: '7,5', pleno: '8,75', senior: '10' } as Record<string, string>)[sdrTier]}% · ${sdrTier})`}
            nome={sdr?.name}
            valor={split.sdr}
          />
          <Pessoa label={rule?.model === 'cafe' ? 'Representante (49%)' : 'Representante (17,5%)'} nome={rep?.name} valor={split.rep} />

          <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Total{rule?.model === 'cafe' ? ' (72%)' : ''}</span>
            <span>{fmtCurrency(split.total)}</span>
          </div>

          {dataPgto && <Linha label="Pagamento (dia 15)" valor={dataPgto.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} />}

          {parcelas.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div className="fl" style={{ marginBottom: 4 }}>Parcelas</div>
              {parcelas.map(p => (
                <div key={p.numero} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                  <span>Parcela {p.numero}/{parcelas.length}</span>
                  <span>{fmtCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={!podeRegistrar} onClick={registrar}>
            {salvando ? 'Registrando…' : 'Registrar comissão'}
          </button>
        </div>
      </div>

      {/* ── Histórico recente ───────────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Comissões registradas</h3>
        {comissoes.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma comissão registrada ainda.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px' }}>Negócio</th>
                <th style={{ padding: '6px 8px' }}>Produto</th>
                <th style={{ padding: '6px 8px' }}>Total</th>
                <th style={{ padding: '6px 8px' }}>Pagamento</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{c.dealName}</td>
                  <td style={{ padding: '6px 8px' }}>{PRODUCT_SKU_LABELS[c.sku] ?? c.sku}</td>
                  <td style={{ padding: '6px 8px' }}>{fmtCurrency(c.split?.total)}</td>
                  <td style={{ padding: '6px 8px' }}>{c.dataPagamento ? new Date(c.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--muted)' }}>
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  );
}

function Pessoa({ label, nome, valor }: { label: string; nome?: string; valor: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13.5, padding: '4px 0' }}>
      <span>{label} — <strong>{nome ?? <span style={{ color: 'var(--muted)' }}>sem responsável</span>}</strong></span>
      <span>{fmtCurrency(valor)}</span>
    </div>
  );
}
