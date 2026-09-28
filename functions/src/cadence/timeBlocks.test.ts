/**
 * timeBlocks.test.ts — Fase 2 do PLANO_DESENHO_CRM.md
 *
 * Esta bateria roda contra `functions/src/cadence/timeBlocks.ts` e existe também
 * em `src/utils/timeBlocks.test.ts`, idêntica, sobre a cópia do frontend.
 * Se as duas cópias divergirem, uma das duas baterias quebra — que é o único
 * mecanismo de defesa possível sem um pacote compartilhado.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIME_BLOCKS,
  UNSCHEDULED_BLOCK_ID,
  normalizeTimeBlocks,
  blockForType,
  blockStartAt,
  formatBlockRange,
  groupActivitiesByBlock,
  currentBlock,
  blockStartMinutes,
  type TimeBlockDef,
} from './timeBlocks';

const bloco = (over: Partial<TimeBlockDef> & { id: string; startHour: number }): TimeBlockDef => ({
  label: over.id,
  startMinute: 0,
  endHour: over.startHour + 1,
  endMinute: 0,
  types: ['email'],
  isBreak: false,
  ...over,
});

describe('DEFAULT_TIME_BLOCKS — o desenho do slide 6', () => {
  it('tem os seis blocos do deck, na ordem', () => {
    expect(DEFAULT_TIME_BLOCKS.map(b => b.startHour)).toEqual([10, 11, 12, 13, 15, 16]);
    expect(DEFAULT_TIME_BLOCKS.map(b => b.label)).toEqual([
      'E-mail', 'LinkedIn', 'Pausa', 'Ligação', 'WhatsApp', 'Follow Up de Agenda',
    ]);
  });

  it('as 12h são pausa e não recebem canal', () => {
    const pausa = DEFAULT_TIME_BLOCKS.find(b => b.id === 'pausa')!;
    expect(pausa.isBreak).toBe(true);
    expect(pausa.types).toEqual([]);
  });

  it('a ligação ocupa 13h–15h, como no deck', () => {
    const lig = DEFAULT_TIME_BLOCKS.find(b => b.id === 'ligacao')!;
    expect(formatBlockRange(lig)).toBe('13h–15h');
  });

  it('o follow-up das 16h cobre a régua de agenda, reunião e visita', () => {
    const fu = DEFAULT_TIME_BLOCKS.find(b => b.id === 'follow_up')!;
    expect(fu.types).toEqual(['agenda', 'meeting', 'visit']);
  });

  it('o padrão passa pela própria normalização', () => {
    expect(normalizeTimeBlocks(DEFAULT_TIME_BLOCKS)).toEqual(DEFAULT_TIME_BLOCKS);
  });
});

describe('normalizeTimeBlocks', () => {
  it('ordena por horário de início', () => {
    const r = normalizeTimeBlocks([
      bloco({ id: 'b', startHour: 15, types: ['call'] }),
      bloco({ id: 'a', startHour: 9, types: ['email'] }),
    ]);
    expect(r.map(b => b.id)).toEqual(['a', 'b']);
  });

  it('preenche o label a partir dos canais quando vem vazio', () => {
    const r = normalizeTimeBlocks([{ id: 'x', startHour: 9, endHour: 10, types: ['call', 'linkedin'] }]);
    expect(r[0].label).toBe('Ligação + LinkedIn');
  });

  it('bloco de pausa sem canal é válido', () => {
    const r = normalizeTimeBlocks([{ id: 'p', startHour: 12, endHour: 13, isBreak: true, types: [] }]);
    expect(r).toHaveLength(1);
    expect(r[0].isBreak).toBe(true);
  });

  // Política igual à de normalizeSteps: config parcial é pior que a padrão.
  it('cai no padrão quando não é lista, é vazia, ou passa do limite', () => {
    expect(normalizeTimeBlocks(null)).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks('10h')).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks(Array.from({ length: 13 }, (_, i) => bloco({ id: `b${i}`, startHour: 1 })))).toEqual(DEFAULT_TIME_BLOCKS);
  });

  it('cai no padrão com hora inválida', () => {
    expect(normalizeTimeBlocks([bloco({ id: 'x', startHour: 24 })])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([bloco({ id: 'x', startHour: -1 })])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([{ id: 'x', startHour: 10, startMinute: 60, endHour: 11 }])).toEqual(DEFAULT_TIME_BLOCKS);
  });

  it('cai no padrão quando o fim não é depois do início', () => {
    expect(normalizeTimeBlocks([{ id: 'x', startHour: 10, endHour: 10, types: ['email'] }])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([{ id: 'x', startHour: 14, endHour: 9, types: ['email'] }])).toEqual(DEFAULT_TIME_BLOCKS);
  });

  it('cai no padrão com id vazio, duplicado ou reservado', () => {
    expect(normalizeTimeBlocks([bloco({ id: '', startHour: 9 })])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([bloco({ id: 'a', startHour: 9 }), bloco({ id: 'a', startHour: 10 })])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([bloco({ id: UNSCHEDULED_BLOCK_ID, startHour: 9 })])).toEqual(DEFAULT_TIME_BLOCKS);
  });

  it('cai no padrão quando bloco de trabalho fica sem canal válido', () => {
    expect(normalizeTimeBlocks([{ id: 'x', startHour: 9, endHour: 10, types: [] }])).toEqual(DEFAULT_TIME_BLOCKS);
    expect(normalizeTimeBlocks([{ id: 'x', startHour: 9, endHour: 10, types: ['telepatia'] }])).toEqual(DEFAULT_TIME_BLOCKS);
  });

  // Canal em dois blocos deixaria indefinido onde a atividade cai.
  it('cai no padrão quando o mesmo canal aparece em dois blocos', () => {
    expect(normalizeTimeBlocks([
      bloco({ id: 'a', startHour: 9, types: ['email'] }),
      bloco({ id: 'b', startHour: 14, types: ['email', 'call'] }),
    ])).toEqual(DEFAULT_TIME_BLOCKS);
  });

  it('zera os canais de um bloco marcado como pausa', () => {
    const r = normalizeTimeBlocks([{ id: 'p', startHour: 12, endHour: 13, isBreak: true, types: ['email'] }]);
    expect(r[0].types).toEqual([]);
  });
});

describe('blockForType', () => {
  it('acha o bloco do canal', () => {
    expect(blockForType(DEFAULT_TIME_BLOCKS, 'call')?.id).toBe('ligacao');
    expect(blockForType(DEFAULT_TIME_BLOCKS, 'meeting')?.id).toBe('follow_up');
    // Tarefas da régua de agenda (Fase 3) caem no mesmo bloco das 16h.
    expect(blockForType(DEFAULT_TIME_BLOCKS, 'agenda')?.id).toBe('follow_up');
  });

  it('canal sem bloco devolve undefined', () => {
    expect(blockForType([bloco({ id: 'a', startHour: 9, types: ['email'] })], 'call')).toBeUndefined();
  });

  it('nunca devolve bloco de pausa', () => {
    const blocks = [{ ...bloco({ id: 'p', startHour: 12 }), isBreak: true, types: ['email' as const] }];
    expect(blockForType(blocks, 'email')).toBeUndefined();
  });
});

describe('blockStartAt', () => {
  it('devolve o instante UTC do início do bloco no dia BRT', () => {
    const b = DEFAULT_TIME_BLOCKS.find(x => x.id === 'email')!; // 10h BRT
    const d = blockStartAt(b, '2026-09-10');
    expect(d.toISOString()).toBe('2026-09-10T13:00:00.000Z'); // 10h BRT = 13h UTC
  });

  it('respeita os minutos do bloco', () => {
    const b = { ...bloco({ id: 'x', startHour: 9 }), startMinute: 30 };
    expect(blockStartAt(b, '2026-01-05').toISOString()).toBe('2026-01-05T12:30:00.000Z');
  });

  it('bloco de fim de tarde não escorrega para o dia seguinte', () => {
    const b = bloco({ id: 'x', startHour: 16 });
    expect(blockStartAt(b, '2026-09-10').toISOString()).toBe('2026-09-10T19:00:00.000Z');
  });
});

describe('formatBlockRange', () => {
  it('bloco de 1h mostra só o início', () => {
    expect(formatBlockRange(bloco({ id: 'x', startHour: 10 }))).toBe('10h');
  });

  it('bloco maior mostra o intervalo', () => {
    expect(formatBlockRange({ ...bloco({ id: 'x', startHour: 13 }), endHour: 15 })).toBe('13h–15h');
  });

  it('minutos aparecem quando não são zero', () => {
    expect(formatBlockRange({ ...bloco({ id: 'x', startHour: 9 }), startMinute: 30, endHour: 12 })).toBe('9h30–12h');
  });
});

describe('groupActivitiesByBlock', () => {
  type A = { id: string; type: string };
  const typeOf = (a: A) => a.type;

  it('distribui as atividades nos blocos certos', () => {
    const secoes = groupActivitiesByBlock<A>(
      [{ id: '1', type: 'email' }, { id: '2', type: 'call' }, { id: '3', type: 'email' }],
      DEFAULT_TIME_BLOCKS, typeOf,
    );
    const porId = Object.fromEntries(secoes.map(s => [s.block.id, s.items.map(i => i.id)]));
    expect(porId['email']).toEqual(['1', '3']);
    expect(porId['ligacao']).toEqual(['2']);
  });

  // Esconder bloco vazio faria a régua parecer diferente a cada dia.
  it('mantém os blocos vazios na lista, pausa incluída', () => {
    const secoes = groupActivitiesByBlock<A>([{ id: '1', type: 'email' }], DEFAULT_TIME_BLOCKS, typeOf);
    expect(secoes).toHaveLength(DEFAULT_TIME_BLOCKS.length);
    expect(secoes.find(s => s.block.id === 'pausa')!.items).toEqual([]);
    expect(secoes.find(s => s.block.id === 'linkedin')!.items).toEqual([]);
  });

  // Descartar atividade da fila do SDR é pior que mostrá-la fora de hora.
  it('atividade sem bloco cai no balde "Sem horário", nunca é descartada', () => {
    const secoes = groupActivitiesByBlock<A>(
      [{ id: '1', type: 'email' }, { id: '9', type: 'carta_pombo' }],
      DEFAULT_TIME_BLOCKS, typeOf,
    );
    const ultimo = secoes[secoes.length - 1];
    expect(ultimo.block.id).toBe(UNSCHEDULED_BLOCK_ID);
    expect(ultimo.items.map(i => i.id)).toEqual(['9']);
  });

  it('sem atividade órfã, o balde não aparece', () => {
    const secoes = groupActivitiesByBlock<A>([{ id: '1', type: 'email' }], DEFAULT_TIME_BLOCKS, typeOf);
    expect(secoes.some(s => s.block.id === UNSCHEDULED_BLOCK_ID)).toBe(false);
  });

  it('nenhuma atividade some no agrupamento', () => {
    const itens: A[] = [
      { id: '1', type: 'email' }, { id: '2', type: 'call' }, { id: '3', type: 'meeting' },
      { id: '4', type: 'nada' }, { id: '5', type: 'whatsapp' },
    ];
    const total = groupActivitiesByBlock<A>(itens, DEFAULT_TIME_BLOCKS, typeOf)
      .reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(itens.length);
  });

  it('lista vazia devolve a régua toda vazia', () => {
    const secoes = groupActivitiesByBlock<A>([], DEFAULT_TIME_BLOCKS, typeOf);
    expect(secoes).toHaveLength(DEFAULT_TIME_BLOCKS.length);
    expect(secoes.every(s => s.items.length === 0)).toBe(true);
  });
});

describe('currentBlock', () => {
  // 2026-09-10T17:30:00Z = 14h30 BRT → dentro do bloco de ligação (13h–15h)
  it('identifica o bloco da hora atual em BRT', () => {
    const agora = new Date('2026-09-10T17:30:00Z');
    expect(currentBlock(DEFAULT_TIME_BLOCKS, agora)?.id).toBe('ligacao');
  });

  it('fora de qualquer bloco devolve undefined', () => {
    const madrugada = new Date('2026-09-10T06:00:00Z'); // 3h BRT
    expect(currentBlock(DEFAULT_TIME_BLOCKS, madrugada)).toBeUndefined();
  });

  it('o fim do bloco é exclusivo — 15h já é WhatsApp, não Ligação', () => {
    const quinze = new Date('2026-09-10T18:00:00Z'); // 15h BRT
    expect(currentBlock(DEFAULT_TIME_BLOCKS, quinze)?.id).toBe('whatsapp');
  });
});

describe('blockStartMinutes', () => {
  it('converte para minutos desde a meia-noite', () => {
    expect(blockStartMinutes({ ...bloco({ id: 'x', startHour: 13 }), startMinute: 45 })).toBe(825);
  });
});
