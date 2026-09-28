/**
 * minhaComissao.ts — Funções puras da tela "Minha Comissão" (Fase 5.1)
 *
 * Slide 11 do deck "Desenho CRM": "SDR e Representante comissionaram
 * (individualmente, sem um ter a visão do outro)."
 *
 * O ponto crítico deste módulo é `minhaFatia`: um `Commission` carrega o
 * rateio INTEIRO do card (`split.total`, `shares[]` com BDR + SDR + Rep). A
 * tela do próprio vendedor NUNCA pode exibir `split.total` nem `shares`
 * completo — só a fatia do uid pedido. Todo agregado aqui soma
 * exclusivamente essa fatia, nunca o total do card.
 *
 * Sem Firebase/React — testável isoladamente, no mesmo espírito de `relatorio.ts`.
 */

import type { Commission, CommissionShare, CommissionStatus } from './types';

/** A fatia do uid neste card, ou undefined se ele não é beneficiário. */
export function minhaFatia(c: Commission, uid: string): CommissionShare | undefined {
  return (c.shares ?? []).find(s => s.userId === uid);
}

/**
 * Filtra a lista para os cards em que o uid realmente tem fatia.
 *
 * Defesa em profundidade: a query já deveria trazer só `beneficiaryIds
 * array-contains uid` (mesma condição das rules), mas se algum card estiver
 * com `beneficiaryIds` desatualizado em relação a `shares` (dado legado, ou
 * escrita fora do fluxo padrão), é `shares` que decide o que aparece — é de
 * lá que vem o valor mostrado.
 */
export function comissoesDoUsuario(lista: Commission[], uid: string): Commission[] {
  return lista.filter(c => !!minhaFatia(c, uid));
}

export interface MinhaComissaoResumo {
  /** Soma da MINHA fatia — nunca `split.total`. Exclui canceladas. */
  totalAReceber: number;
  totalPago: number;
  contagemPorStatus: Record<CommissionStatus, number>;
}

/** Resumo pronto para os cards do topo da tela. */
export function resumoMinhaComissao(lista: Commission[], uid: string): MinhaComissaoResumo {
  const base: Record<CommissionStatus, number> = { projetada: 0, confirmada: 0, paga: 0, cancelada: 0 };
  let totalAReceber = 0;
  let totalPago = 0;

  for (const c of lista) {
    const fatia = minhaFatia(c, uid);
    if (!fatia) continue;
    base[c.status] = (base[c.status] ?? 0) + 1;
    if (c.status === 'cancelada') continue;
    totalAReceber = arredondar(totalAReceber + fatia.valor);
    if (c.status === 'paga') totalPago = arredondar(totalPago + fatia.valor);
  }

  return { totalAReceber, totalPago, contagemPorStatus: base };
}

function arredondar(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Uma linha da lista de comissões do vendedor — só o que é dele. */
export interface MinhaComissaoLinha {
  id: string;
  dealName: string;
  sku: Commission['sku'];
  meuPapel: CommissionShare['role'];
  minhaFatia: number;
  status: CommissionStatus;
  dataPagamento?: string;
}

/** Monta as linhas da tabela, ordenadas por data de pagamento (mais recente primeiro). */
export function linhasMinhaComissao(lista: Commission[], uid: string): MinhaComissaoLinha[] {
  return comissoesDoUsuario(lista, uid)
    .map(c => {
      const fatia = minhaFatia(c, uid)!;
      return {
        id: c.id ?? '',
        dealName: c.dealName,
        sku: c.sku,
        meuPapel: fatia.role,
        minhaFatia: fatia.valor,
        status: c.status,
        dataPagamento: c.dataPagamento,
      };
    })
    .sort((a, b) => (b.dataPagamento ?? '').localeCompare(a.dataPagamento ?? ''));
}
