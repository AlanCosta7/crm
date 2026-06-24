import { describe, it, expect } from 'vitest';
import {
  cicloKey,
  cicloLabel,
  filtrarComissoes,
  ciclosDisponiveis,
  agruparPorVendedor,
  totalGeral,
  contagemPorStatus,
  comissoesParaCSV,
} from './relatorio';
import type { Commission } from './types';

function mk(p: Partial<Commission>): Commission {
  return {
    dealId: 'd', dealName: 'Negócio X', sku: 'wizmart_minimercado',
    faturamentoInformado: 1000, baseCalculo: 1000, proporcional: false,
    split: { bdr: 20, sdr: 75, rep: 175, total: 270 },
    shares: [
      { role: 'bdr', userId: 'u-bdr', userName: 'Ana', valor: 20 },
      { role: 'sdr', userId: 'u-sdr', userName: 'Bia', valor: 75 },
      { role: 'rep', userId: 'u-rep', userName: 'Caio', valor: 175 },
    ],
    beneficiaryIds: ['u-bdr', 'u-sdr', 'u-rep'],
    status: 'confirmada',
    dataPagamento: '2026-06-15T00:00:00.000Z',
    ...p,
  };
}

describe('cicloKey / cicloLabel', () => {
  it('extrai YYYY-MM e rotula em pt-BR', () => {
    expect(cicloKey('2026-06-15T00:00:00.000Z')).toBe('2026-06');
    expect(cicloLabel('2026-06')).toBe('jun/2026');
    expect(cicloKey(undefined)).toBe('sem-data');
  });
});

describe('filtrarComissoes', () => {
  const lista = [
    mk({ dataPagamento: '2026-06-15T00:00:00Z', status: 'paga' }),
    mk({ dataPagamento: '2026-07-15T00:00:00Z', status: 'projetada' }),
    mk({ dataPagamento: '2026-06-15T00:00:00Z', beneficiaryIds: ['u-sdr'], status: 'confirmada' }),
  ];
  it('filtra por ciclo', () => {
    expect(filtrarComissoes(lista, { ciclo: '2026-06' })).toHaveLength(2);
  });
  it('filtra por status', () => {
    expect(filtrarComissoes(lista, { status: 'projetada' })).toHaveLength(1);
  });
  it('filtra por vendedor beneficiário', () => {
    expect(filtrarComissoes(lista, { vendedorId: 'u-rep' })).toHaveLength(2);
    expect(filtrarComissoes(lista, { vendedorId: 'u-sdr' })).toHaveLength(3);
  });
});

describe('ciclosDisponiveis', () => {
  it('retorna ciclos únicos ordenados desc', () => {
    const r = ciclosDisponiveis([
      mk({ dataPagamento: '2026-06-15T00:00:00Z' }),
      mk({ dataPagamento: '2026-07-15T00:00:00Z' }),
      mk({ dataPagamento: '2026-06-15T00:00:00Z' }),
    ]);
    expect(r).toEqual(['2026-07', '2026-06']);
  });
});

describe('agruparPorVendedor', () => {
  it('soma a participação por vendedor e ordena desc', () => {
    const r = agruparPorVendedor([mk({}), mk({})]);
    expect(r[0]).toEqual({ userId: 'u-rep', userName: 'Caio', total: 350, count: 2 });
    expect(r.find(x => x.userId === 'u-sdr')?.total).toBe(150);
  });
  it('ignora comissões canceladas', () => {
    expect(agruparPorVendedor([mk({ status: 'cancelada' })])).toEqual([]);
  });
});

describe('totalGeral e contagemPorStatus', () => {
  it('soma totais excluindo canceladas', () => {
    expect(totalGeral([mk({}), mk({ status: 'cancelada' })])).toBe(270);
  });
  it('conta por status', () => {
    const c = contagemPorStatus([mk({ status: 'paga' }), mk({ status: 'paga' }), mk({ status: 'projetada' })]);
    expect(c.paga).toBe(2);
    expect(c.projetada).toBe(1);
    expect(c.confirmada).toBe(0);
  });
});

describe('comissoesParaCSV', () => {
  it('gera cabeçalho + linha com separador ;', () => {
    const csv = comissoesParaCSV([mk({})]);
    const linhas = csv.split('\n');
    expect(linhas[0]).toBe('Negócio;Produto;BDR;SDR;Rep;Total;Pagamento;Status');
    expect(linhas[1]).toContain('Ana;Bia;Caio');
    expect(linhas[1]).toContain('15/06/2026');
  });
});
