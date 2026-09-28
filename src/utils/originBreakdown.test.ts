/**
 * originBreakdown.test.ts — Fase 4 do PLANO_DESENHO_CRM.md
 *
 * O caso que mais importa aqui é o das reuniões: elas vêm de `activities`, que
 * não têm origem, e precisam resolvê-la pelo `dealId`. Uma reunião cujo deal
 * não está carregado NÃO pode ser empurrada para Outbound — o total do widget
 * tem que continuar batendo, com o resto aparecendo como "sem origem".
 */
import { describe, it, expect } from 'vitest';
import {
  indexDealsById,
  breakdownDeals,
  breakdownMeetings,
  breakdownLabel,
  agendaRowsFromDeals,
  agendaRowsFromMeetings,
  filterAgendaRows,
} from './originBreakdown';
import type { Deal, ActivityFeedItem } from '../types/crm';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, name: `Deal ${id}`, company: `Empresa ${id}`, value: 0, stage: 'prospeccao',
  owner: 'sdr-1', due: '—', tasks: { e: false, w: false, m: false },
  ...over,
} as Deal);

const meeting = (id: string, dealId?: string, over: Record<string, unknown> = {}): ActivityFeedItem =>
  ({ id, type: 'meeting', dealId, userId: 'sdr-1', ...over }) as unknown as ActivityFeedItem;

const nomes: Record<string, string> = { 'sdr-1': 'Giulia', 'sdr-2': 'Bruno', 'rep-1': 'Ricardo' };
const nameOf = (uid?: string) => (uid ? nomes[uid] ?? '' : '');

describe('breakdownDeals', () => {
  it('quebra visitas por origem', () => {
    const r = breakdownDeals([
      deal('a', { origin: 'inbound' }),
      deal('b', { origin: 'outbound' }),
      deal('c', { origin: 'outbound' }),
    ]);
    expect(r).toEqual({ inbound: 1, outbound: 2, total: 3 });
  });

  it('deal sem origin conta como outbound (mesmo default do servidor)', () => {
    expect(breakdownDeals([deal('a')])).toEqual({ inbound: 0, outbound: 1, total: 1 });
  });

  it('lista vazia', () => {
    expect(breakdownDeals([])).toEqual({ inbound: 0, outbound: 0, total: 0 });
  });

  // É literalmente o exemplo do slide 2 do deck.
  it('reproduz o exemplo do deck: 3 visitas — 1 Inbound / 2 Outbound', () => {
    const r = breakdownDeals([
      deal('a', { origin: 'inbound' }),
      deal('b', { origin: 'outbound' }),
      deal('c', { origin: 'outbound' }),
    ]);
    expect(breakdownLabel(r)).toBe('1 Inbound / 2 Outbound');
  });
});

describe('breakdownMeetings', () => {
  const deals = [deal('d1', { origin: 'inbound' }), deal('d2', { origin: 'outbound' })];
  const idx = indexDealsById(deals);

  it('resolve a origem da reunião pelo deal', () => {
    const r = breakdownMeetings([meeting('m1', 'd1'), meeting('m2', 'd2')], idx);
    expect(r).toEqual({ inbound: 1, outbound: 1, unresolved: 0, total: 2 });
  });

  it('reunião com deal desconhecido vira "sem origem", NÃO outbound', () => {
    const r = breakdownMeetings([meeting('m1', 'd-fantasma')], idx);
    expect(r).toEqual({ inbound: 0, outbound: 0, unresolved: 1, total: 1 });
  });

  it('reunião legada sem dealId vira "sem origem"', () => {
    const r = breakdownMeetings([meeting('m1', undefined)], idx);
    expect(r.unresolved).toBe(1);
  });

  // Invariante do widget: o número grande não pode mudar por causa da quebra.
  it('inbound + outbound + unresolved sempre é igual ao total', () => {
    const r = breakdownMeetings(
      [meeting('m1', 'd1'), meeting('m2', 'd2'), meeting('m3', 'x'), meeting('m4')],
      idx,
    );
    expect(r.inbound + r.outbound + r.unresolved).toBe(r.total);
    expect(r.total).toBe(4);
  });

  it('o rótulo mostra os sem origem à parte', () => {
    const r = breakdownMeetings([meeting('m1', 'd1'), meeting('m2', 'x')], idx);
    expect(breakdownLabel(r)).toBe('1 Inbound / 0 Outbound / 1 sem origem');
  });

  it('sem nenhum irresolvido, o rótulo não menciona "sem origem"', () => {
    const r = breakdownMeetings([meeting('m1', 'd1')], idx);
    expect(breakdownLabel(r)).toBe('1 Inbound / 0 Outbound');
  });
});

describe('indexDealsById', () => {
  it('indexa por id', () => {
    const idx = indexDealsById([deal('a'), deal('b')]);
    expect(idx.get('a')?.company).toBe('Empresa a');
    expect(idx.size).toBe(2);
  });

  it('ignora deals sem id', () => {
    expect(indexDealsById([{ ...deal('a'), id: '' } as Deal]).size).toBe(0);
  });
});

describe('agendaRowsFromDeals', () => {
  it('monta a linha com cidade, população e quem agendou (slide 2)', () => {
    const rows = agendaRowsFromDeals([
      deal('d1', {
        origin: 'inbound', assignedSdrId: 'sdr-1', visitPopulation: 1200,
        location: { state: 'SP', city: 'Campinas' },
      }),
    ], nameOf);
    expect(rows[0]).toEqual({
      key: 'd1', company: 'Empresa d1', city: 'Campinas', state: 'SP',
      population: 1200, scheduledBy: 'Giulia', origin: 'inbound',
    });
  });

  it('usa `uf` quando não há location.state (formato do seed)', () => {
    const rows = agendaRowsFromDeals([{ ...deal('d1'), uf: 'PR' } as Deal], nameOf);
    expect(rows[0].state).toBe('PR');
  });

  it('cai no rep e depois no owner quando não há SDR', () => {
    expect(agendaRowsFromDeals([deal('d1', { assignedSdrId: '', assignedRepId: 'rep-1' })], nameOf)[0].scheduledBy).toBe('Ricardo');
    expect(agendaRowsFromDeals([deal('d1', { owner: 'sdr-2' })], nameOf)[0].scheduledBy).toBe('Bruno');
  });
});

describe('agendaRowsFromMeetings', () => {
  const idx = indexDealsById([
    deal('d1', { origin: 'inbound', visitPopulation: 800, location: { state: 'RJ', city: 'Niterói' } }),
  ]);

  it('puxa empresa, cidade e população do deal da reunião', () => {
    const rows = agendaRowsFromMeetings([meeting('m1', 'd1', { userId: 'sdr-2' })], idx, nameOf);
    expect(rows[0]).toMatchObject({
      company: 'Empresa d1', city: 'Niterói', state: 'RJ',
      population: 800, scheduledBy: 'Bruno', origin: 'inbound',
    });
  });

  // Sumir com a linha faria o total do widget não bater com a lista aberta.
  it('reunião sem deal aparece na lista com origin null', () => {
    const rows = agendaRowsFromMeetings([meeting('m1', 'x', { companyName: 'Empresa Y' })], idx, nameOf);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company: 'Empresa Y', origin: null });
  });

  it('sem deal e sem companyName, mostra travessão em vez de vazio', () => {
    expect(agendaRowsFromMeetings([meeting('m1')], idx, nameOf)[0].company).toBe('—');
  });
});

describe('filterAgendaRows', () => {
  const rows = agendaRowsFromMeetings(
    [meeting('m1', 'd1'), meeting('m2', 'd2'), meeting('m3', 'x')],
    indexDealsById([deal('d1', { origin: 'inbound' }), deal('d2', { origin: 'outbound' })]),
    nameOf,
  );

  it('all mostra tudo, inclusive as sem origem', () => {
    expect(filterAgendaRows(rows, 'all')).toHaveLength(3);
  });

  it('filtrar inbound exclui as sem origem', () => {
    const r = filterAgendaRows(rows, 'inbound');
    expect(r).toHaveLength(1);
    expect(r[0].origin).toBe('inbound');
  });

  it('filtrar outbound também exclui as sem origem', () => {
    expect(filterAgendaRows(rows, 'outbound')).toHaveLength(1);
  });
});
