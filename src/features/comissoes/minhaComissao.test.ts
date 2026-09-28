import { describe, it, expect } from 'vitest';
import { minhaFatia, comissoesDoUsuario, resumoMinhaComissao, linhasMinhaComissao } from './minhaComissao';
import type { Commission } from './types';

const SDR = 'uid-sdr-1';
const REP = 'uid-rep-1';
const BDR = 'uid-bdr-1';
const OUTRO_SDR = 'uid-sdr-2';

function comissao(over: Partial<Commission>): Commission {
  return {
    dealId: 'deal-1',
    dealName: 'Mercado Central',
    sku: 'wizmart_minimercado',
    faturamentoInformado: 3000,
    baseCalculo: 3000,
    proporcional: false,
    split: { bdr: 60, sdr: 262.5, rep: 525, total: 847.5 },
    shares: [
      { role: 'bdr', userId: BDR, userName: 'Bruno BDR', valor: 60 },
      { role: 'sdr', userId: SDR, userName: 'Sara SDR', valor: 262.5, tier: 'junior' },
      { role: 'rep', userId: REP, userName: 'Rafael Rep', valor: 525 },
    ],
    beneficiaryIds: [BDR, SDR, REP],
    status: 'confirmada',
    dataPagamento: '2026-10-15',
    ...over,
  };
}

describe('minhaFatia — o ponto crítico de privacidade da tela', () => {
  it('devolve só a fatia do uid pedido', () => {
    const c = comissao({});
    expect(minhaFatia(c, SDR)).toEqual({ role: 'sdr', userId: SDR, userName: 'Sara SDR', valor: 262.5, tier: 'junior' });
    expect(minhaFatia(c, REP)?.valor).toBe(525);
    expect(minhaFatia(c, BDR)?.valor).toBe(60);
  });

  it('quem não é beneficiário não tem fatia nenhuma', () => {
    expect(minhaFatia(comissao({}), OUTRO_SDR)).toBeUndefined();
  });

  it('shares vazio não quebra', () => {
    expect(minhaFatia(comissao({ shares: [] }), SDR)).toBeUndefined();
  });
});

describe('comissoesDoUsuario', () => {
  it('mantém só os cards em que o uid tem fatia', () => {
    const minhas = [comissao({ dealId: 'd1' }), comissao({ dealId: 'd2', shares: [] })];
    expect(comissoesDoUsuario(minhas, SDR)).toHaveLength(1);
    expect(comissoesDoUsuario(minhas, SDR)[0].dealId).toBe('d1');
  });

  // Defesa em profundidade: beneficiaryIds desatualizado não deve vazar nem
  // esconder — quem decide é `shares`, de onde vem o valor mostrado.
  it('ignora beneficiaryIds desalinhado de shares', () => {
    const c = comissao({ beneficiaryIds: [SDR, REP, OUTRO_SDR] }); // OUTRO_SDR não está em shares
    expect(comissoesDoUsuario([c], OUTRO_SDR)).toHaveLength(0);
  });
});

describe('resumoMinhaComissao — nunca soma split.total', () => {
  it('soma só a MINHA fatia, não o total do card', () => {
    const lista = [comissao({ dealId: 'd1' })];
    const r = resumoMinhaComissao(lista, SDR);
    expect(r.totalAReceber).toBe(262.5); // não 847.5 (split.total)
  });

  it('soma múltiplos cards do mesmo vendedor', () => {
    const lista = [
      comissao({ dealId: 'd1', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 100 }] }),
      comissao({ dealId: 'd2', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 200 }] }),
    ];
    expect(resumoMinhaComissao(lista, SDR).totalAReceber).toBe(300);
  });

  it('exclui canceladas do total a receber', () => {
    const lista = [
      comissao({ dealId: 'd1', status: 'confirmada', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 100 }] }),
      comissao({ dealId: 'd2', status: 'cancelada', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 999 }] }),
    ];
    expect(resumoMinhaComissao(lista, SDR).totalAReceber).toBe(100);
  });

  it('totalPago soma só as pagas', () => {
    const lista = [
      comissao({ dealId: 'd1', status: 'paga', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 100 }] }),
      comissao({ dealId: 'd2', status: 'confirmada', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 200 }] }),
    ];
    const r = resumoMinhaComissao(lista, SDR);
    expect(r.totalPago).toBe(100);
    expect(r.totalAReceber).toBe(300);
  });

  it('contagem por status considera só os cards do uid', () => {
    const lista = [
      comissao({ dealId: 'd1', status: 'paga' }),
      comissao({ dealId: 'd2', status: 'projetada', shares: [] }), // não é do SDR
    ];
    expect(resumoMinhaComissao(lista, SDR).contagemPorStatus.paga).toBe(1);
    expect(resumoMinhaComissao(lista, SDR).contagemPorStatus.projetada).toBe(0);
  });

  it('lista vazia devolve zeros', () => {
    const r = resumoMinhaComissao([], SDR);
    expect(r).toEqual({ totalAReceber: 0, totalPago: 0, contagemPorStatus: { projetada: 0, confirmada: 0, paga: 0, cancelada: 0 } });
  });

  it('arredonda para centavos', () => {
    const lista = [
      comissao({ dealId: 'd1', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 0.1 }] }),
      comissao({ dealId: 'd2', shares: [{ role: 'sdr', userId: SDR, userName: 'Sara', valor: 0.2 }] }),
    ];
    expect(resumoMinhaComissao(lista, SDR).totalAReceber).toBe(0.3);
  });
});

describe('linhasMinhaComissao', () => {
  it('cada linha traz só o meu papel e minha fatia, nunca o total do card', () => {
    const linhas = linhasMinhaComissao([comissao({})], REP);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ dealName: 'Mercado Central', meuPapel: 'rep', minhaFatia: 525, status: 'confirmada' });
    expect(linhas[0]).not.toHaveProperty('split');
    expect(linhas[0]).not.toHaveProperty('shares');
  });

  it('ordena por data de pagamento, mais recente primeiro', () => {
    const linhas = linhasMinhaComissao([
      comissao({ dealId: 'd1', dataPagamento: '2026-06-15' }),
      comissao({ dealId: 'd2', dataPagamento: '2026-10-15' }),
      comissao({ dealId: 'd3', dataPagamento: '2026-08-15' }),
    ], SDR);
    expect(linhas.map(l => l.dataPagamento)).toEqual(['2026-10-15', '2026-08-15', '2026-06-15']);
  });

  it('sem fatia nenhuma, devolve lista vazia', () => {
    expect(linhasMinhaComissao([comissao({ shares: [] })], SDR)).toEqual([]);
  });
});
