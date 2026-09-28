import { describe, it, expect } from 'vitest';
import { dealsToReassign } from './reassignCarteira';

describe('dealsToReassign', () => {
  const deals = [
    { id: 'd1', status: 'open' as const, assignedSdrId: 'sdr-1' },
    { id: 'd2', status: 'open' as const, assignedSdrId: 'sdr-2' },
    { id: 'd3', status: 'won' as const, assignedSdrId: 'sdr-1' },
    { id: 'd4', status: 'lost' as const, assignedSdrId: 'sdr-1' },
    { id: 'd5', assignedSdrId: 'sdr-1' }, // sem status — trata como 'open'
    { id: 'd6', status: 'open' as const, assignedRepId: 'sdr-1' }, // campo errado, não é o do papel sdr
  ];

  it('reatribui só deals abertos do sdr informado', () => {
    const writes = dealsToReassign(deals, 'sdr-1', 'sdr');
    expect(writes).toEqual([
      { dealId: 'd1', field: 'assignedSdrId' },
      { dealId: 'd5', field: 'assignedSdrId' },
    ]);
  });

  it('ignora deals won/lost — carteira fechada não precisa de novo dono', () => {
    const writes = dealsToReassign(deals, 'sdr-1', 'sdr');
    expect(writes.find((w) => w.dealId === 'd3')).toBeUndefined();
    expect(writes.find((w) => w.dealId === 'd4')).toBeUndefined();
  });

  it('usa assignedRepId para o papel rep', () => {
    const repDeals = [
      { id: 'r1', status: 'open' as const, assignedRepId: 'rep-1' },
      { id: 'r2', status: 'open' as const, assignedSdrId: 'rep-1' }, // campo errado p/ rep
    ];
    expect(dealsToReassign(repDeals, 'rep-1', 'rep')).toEqual([
      { dealId: 'r1', field: 'assignedRepId' },
    ]);
  });

  it('papel sem carteira própria (manager/master/bdr/viewer) não reatribui nada', () => {
    expect(dealsToReassign(deals, 'sdr-1', 'manager')).toEqual([]);
    expect(dealsToReassign(deals, 'sdr-1', 'master')).toEqual([]);
    expect(dealsToReassign(deals, 'sdr-1', 'bdr')).toEqual([]);
    expect(dealsToReassign(deals, 'sdr-1', 'viewer')).toEqual([]);
  });

  it('sem fromUid, devolve lista vazia', () => {
    expect(dealsToReassign(deals, '', 'sdr')).toEqual([]);
  });

  it('lista de deals vazia devolve lista vazia', () => {
    expect(dealsToReassign([], 'sdr-1', 'sdr')).toEqual([]);
  });
});
