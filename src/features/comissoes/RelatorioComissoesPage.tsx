/**
 * RelatorioComissoesPage.tsx — Relatório de comissões (Fase 4)
 *
 * Filtros por ciclo de pagamento (dia 15), vendedor e status. Resumo por status,
 * total do ciclo, agregação por vendedor, mudança de status inline e export CSV.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToastStore } from '../../stores/toastStore';
import { fmtCurrency } from '../../utils/crmFormat';
import { PRODUCT_SKU_LABELS, type SettingUser } from '../../types/crm';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { useComissoes } from './useComissoes';
import type { CommissionStatus } from './types';
import {
  cicloLabel,
  ciclosDisponiveis,
  filtrarComissoes,
  agruparPorVendedor,
  totalGeral,
  contagemPorStatus,
  comissoesParaCSV,
} from './relatorio';

const STATUS_OPTS: CommissionStatus[] = ['projetada', 'confirmada', 'paga', 'cancelada'];
const STATUS_LABEL: Record<CommissionStatus, string> = {
  projetada: 'Projetada', confirmada: 'Confirmada', paga: 'Paga', cancelada: 'Cancelada',
};

export default function RelatorioComissoesPage() {
  const { addToast } = useToastStore();
  const { comissoes, atualizarComissao } = useComissoes();
  const { data: users } = useFirestoreCollection<SettingUser>('users');

  const [ciclo, setCiclo] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [status, setStatus] = useState<CommissionStatus | ''>('');

  const ciclos = useMemo(() => ciclosDisponiveis(comissoes), [comissoes]);

  const filtradas = useMemo(
    () => filtrarComissoes(comissoes, {
      ciclo: ciclo || undefined,
      vendedorId: vendedorId || undefined,
      status: status || undefined,
    }),
    [comissoes, ciclo, vendedorId, status],
  );

  const total = totalGeral(filtradas);
  const porStatus = contagemPorStatus(filtradas);
  const porVendedor = agruparPorVendedor(filtradas);

  async function mudarStatus(id: string, novo: CommissionStatus) {
    try {
      await atualizarComissao(id, { status: novo });
      addToast({ type: 'success', message: 'Status atualizado', sub: STATUS_LABEL[novo] });
    } catch (e) {
      addToast({ type: 'error', message: 'Falha ao atualizar status', sub: String(e) });
    }
  }

  function exportar() {
    const csv = comissoesParaCSV(filtradas);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes${ciclo ? '-' + ciclo : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Relatório de Comissões</h1>
        <Link to="/comissoes" className="btn" style={{ fontSize: 13 }}>← Calculadora</Link>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 20 }}>
        Comissões agrupadas por ciclo de pagamento (dia 15) e por vendedor.
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <select className="input" style={{ width: 'auto' }} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          <option value="">Todos os ciclos</option>
          {ciclos.map(c => <option key={c} value={c}>{cicloLabel(c)}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as CommissionStatus | '')}>
          <option value="">Todos os status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn" onClick={exportar} disabled={filtradas.length === 0}>Exportar CSV</button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 22 }}>
        <Card label="Total no filtro" valor={fmtCurrency(total)} destaque />
        <Card label="Projetadas" valor={String(porStatus.projetada)} />
        <Card label="Confirmadas" valor={String(porStatus.confirmada)} />
        <Card label="Pagas" valor={String(porStatus.paga)} />
        <Card label="Canceladas" valor={String(porStatus.cancelada)} />
      </div>

      {/* Por vendedor */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Por vendedor</h3>
      {porVendedor.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>Sem dados para o filtro.</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 26 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Vendedor</th>
              <th style={{ padding: '6px 8px' }}>Comissões</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total a receber</th>
            </tr>
          </thead>
          <tbody>
            {porVendedor.map(v => (
              <tr key={v.userId} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{v.userName}</td>
                <td style={{ padding: '6px 8px' }}>{v.count}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Detalhe */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Detalhe</h3>
      {filtradas.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma comissão no filtro.</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Negócio</th>
              <th style={{ padding: '6px 8px' }}>Produto</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '6px 8px' }}>Pagamento</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{c.dealName}</td>
                <td style={{ padding: '6px 8px' }}>{PRODUCT_SKU_LABELS[c.sku] ?? c.sku}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtCurrency(c.split?.total)}</td>
                <td style={{ padding: '6px 8px' }}>{c.dataPagamento ? new Date(c.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <select className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 12.5 }}
                    value={c.status} onChange={e => c.id && mudarStatus(c.id, e.target.value as CommissionStatus)}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Card({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: destaque ? 18 : 16, fontWeight: 700 }}>{valor}</div>
    </div>
  );
}
