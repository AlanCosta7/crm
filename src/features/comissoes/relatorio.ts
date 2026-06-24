/**
 * relatorio.ts — Funções puras de relatório/agregação de comissões.
 * Sem Firebase/React — testável isoladamente.
 */

import { fmtCurrency } from '../../utils/crmFormat';
import { PRODUCT_SKU_LABELS } from '../../types/crm';
import type { Commission, CommissionStatus } from './types';

/** Chave do ciclo de pagamento (mês do dia 15) a partir de um ISO. 'YYYY-MM'. */
export function cicloKey(iso?: string): string {
  if (!iso) return 'sem-data';
  // Usa UTC para casar com dataPagamentoDia15 (gerada em UTC).
  return iso.slice(0, 7); // 'YYYY-MM'
}

/** Rótulo amigável do ciclo: 'jun/2026'. */
export function cicloLabel(key: string): string {
  if (key === 'sem-data') return 'Sem data';
  const [ano, mes] = key.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(mes) - 1;
  return `${meses[idx] ?? mes}/${ano}`;
}

export interface RelatorioFiltro {
  ciclo?: string;       // 'YYYY-MM' | 'sem-data' | undefined (todos)
  vendedorId?: string;  // filtra comissões em que o vendedor é beneficiário
  status?: CommissionStatus;
}

export function filtrarComissoes(lista: Commission[], f: RelatorioFiltro): Commission[] {
  return lista.filter(c => {
    if (f.ciclo && cicloKey(c.dataPagamento) !== f.ciclo) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.vendedorId && !(c.beneficiaryIds ?? []).includes(f.vendedorId)) return false;
    return true;
  });
}

/** Lista de ciclos presentes, ordenada do mais recente para o mais antigo. */
export function ciclosDisponiveis(lista: Commission[]): string[] {
  const set = new Set<string>();
  lista.forEach(c => set.add(cicloKey(c.dataPagamento)));
  return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export interface VendedorAgregado {
  userId: string;
  userName: string;
  total: number;
  count: number;
}

/**
 * Soma, por vendedor, o valor da sua participação (share) nas comissões dadas.
 * Comissões canceladas são ignoradas no total.
 */
export function agruparPorVendedor(lista: Commission[]): VendedorAgregado[] {
  const mapa = new Map<string, VendedorAgregado>();
  for (const c of lista) {
    if (c.status === 'cancelada') continue;
    for (const s of c.shares ?? []) {
      const cur = mapa.get(s.userId) ?? { userId: s.userId, userName: s.userName, total: 0, count: 0 };
      cur.total = Math.round((cur.total + s.valor + Number.EPSILON) * 100) / 100;
      cur.count += 1;
      cur.userName = s.userName || cur.userName;
      mapa.set(s.userId, cur);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
}

/** Total geral (exclui canceladas). */
export function totalGeral(lista: Commission[]): number {
  const v = lista
    .filter(c => c.status !== 'cancelada')
    .reduce((acc, c) => acc + (c.split?.total ?? 0), 0);
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Contagem por status. */
export function contagemPorStatus(lista: Commission[]): Record<CommissionStatus, number> {
  const base: Record<CommissionStatus, number> = { projetada: 0, confirmada: 0, paga: 0, cancelada: 0 };
  for (const c of lista) base[c.status] = (base[c.status] ?? 0) + 1;
  return base;
}

const CSV_HEADERS = ['Negócio', 'Produto', 'BDR', 'SDR', 'Rep', 'Total', 'Pagamento', 'Status'];

function csvCell(v: string | number | undefined): string {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera CSV (separador ';' — padrão BR para abrir no Excel). */
export function comissoesParaCSV(lista: Commission[]): string {
  const linhas = [CSV_HEADERS.join(';')];
  for (const c of lista) {
    const share = (r: string) => (c.shares ?? []).find(s => s.role === r);
    const pgto = c.dataPagamento ? new Date(c.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
    linhas.push([
      csvCell(c.dealName),
      csvCell(PRODUCT_SKU_LABELS[c.sku] ?? c.sku),
      csvCell(share('bdr')?.userName),
      csvCell(share('sdr')?.userName),
      csvCell(share('rep')?.userName),
      csvCell(fmtCurrency(c.split?.total)),
      csvCell(pgto),
      csvCell(c.status),
    ].join(';'));
  }
  return linhas.join('\n');
}
