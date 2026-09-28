import { describe, it, expect } from 'vitest';
import {
  serializeMention,
  parseMentionHref,
  extractMentions,
  findMentionQuery,
  insertMention,
  filterMentionCandidates,
  newMentions,
} from './mentions';
import type { Seller } from '../../../types/crm';

const sellers: Seller[] = [
  { id: 'sdr-001', name: 'João SDR', initials: 'JS', color: '#B45309' },
  { id: 'sdr-002', name: 'Mariana SDR', initials: 'MS', color: '#D97706' },
  { id: 'rep-001', name: 'Carla Rep', initials: 'CR', color: '#B91C1C' },
  { id: 'bdr-001', name: 'Lucas BDR', initials: 'LB', color: '#7C3AED' },
];

describe('serializeMention', () => {
  it('guarda o uid no href para sobreviver a troca de nome', () => {
    expect(serializeMention('Carla Rep', 'rep-001')).toBe('[@Carla Rep](wm:user/rep-001)');
  });

  it('remove colchetes e parênteses que quebrariam o link', () => {
    expect(serializeMention('Ana [Comercial] (SP)', 'x1')).toBe('[@Ana Comercial SP](wm:user/x1)');
  });

  it('não gera rótulo vazio', () => {
    expect(serializeMention('', 'x1')).toBe('[@pessoa](wm:user/x1)');
  });
});

describe('parseMentionHref', () => {
  it('reconhece href de menção', () => {
    expect(parseMentionHref('wm:user/rep-001')).toBe('rep-001');
  });

  it('ignora links comuns', () => {
    expect(parseMentionHref('https://wizmart.com.br')).toBeNull();
    expect(parseMentionHref('mailto:x@y.com')).toBeNull();
    expect(parseMentionHref(undefined)).toBeNull();
  });

  it('ignora menção sem uid', () => {
    expect(parseMentionHref('wm:user/')).toBeNull();
  });
});

describe('extractMentions', () => {
  it('coleta os uids na ordem em que aparecem', () => {
    const body = 'Falei com [@Carla Rep](wm:user/rep-001) e [@João SDR](wm:user/sdr-001).';
    expect(extractMentions(body)).toEqual(['rep-001', 'sdr-001']);
  });

  it('não repete quem foi mencionado duas vezes', () => {
    const body = '[@Carla](wm:user/rep-001) ... [@Carla](wm:user/rep-001)';
    expect(extractMentions(body)).toEqual(['rep-001']);
  });

  it('ignora links normais', () => {
    expect(extractMentions('veja [proposta](https://x.com/p)')).toEqual([]);
  });

  it('devolve lista vazia para corpo vazio', () => {
    expect(extractMentions('')).toEqual([]);
  });
});

describe('findMentionQuery', () => {
  it('detecta o @ no início do texto', () => {
    expect(findMentionQuery('@car', 4)).toEqual({ start: 0, query: 'car' });
  });

  it('detecta o @ depois de espaço', () => {
    expect(findMentionQuery('avisar @mari', 12)).toEqual({ start: 7, query: 'mari' });
  });

  it('não abre no meio de um e-mail', () => {
    expect(findMentionQuery('contato@empresa.com', 19)).toBeNull();
  });

  it('aceita nome com espaço', () => {
    expect(findMentionQuery('cc @carla r', 11)).toEqual({ start: 3, query: 'carla r' });
  });

  it('encerra na quebra de linha', () => {
    expect(findMentionQuery('@carla\nnova linha', 17)).toBeNull();
  });

  it('não confunde com menção já inserida', () => {
    const body = '[@Carla Rep](wm:user/rep-001)';
    expect(findMentionQuery(body, body.length)).toBeNull();
  });

  it('desiste quando a busca fica longa demais', () => {
    expect(findMentionQuery(`@${'a'.repeat(40)}`, 41)).toBeNull();
  });

  it('devolve null quando não há @ antes do cursor', () => {
    expect(findMentionQuery('texto qualquer', 14)).toBeNull();
  });
});

describe('insertMention', () => {
  it('substitui a busca pela menção e deixa espaço para continuar', () => {
    const text = 'avisar @car';
    const query = findMentionQuery(text, 11)!;
    const r = insertMention(text, query, 11, 'Carla Rep', 'rep-001');

    expect(r.text).toBe('avisar [@Carla Rep](wm:user/rep-001) ');
    expect(r.start).toBe(r.text.length);
    expect(r.start).toBe(r.end);
  });

  it('preserva o texto que vem depois do cursor', () => {
    const text = 'avisar @car sobre a proposta';
    const query = findMentionQuery(text, 11)!;
    const r = insertMention(text, query, 11, 'Carla Rep', 'rep-001');

    expect(r.text).toBe('avisar [@Carla Rep](wm:user/rep-001)  sobre a proposta');
  });
});

describe('filterMentionCandidates', () => {
  it('busca pelo começo do nome', () => {
    const r = filterMentionCandidates(sellers, 'mari');
    expect(r.map(c => c.uid)).toEqual(['sdr-002']);
  });

  it('busca por qualquer palavra do nome', () => {
    expect(filterMentionCandidates(sellers, 'rep').map(c => c.uid)).toEqual(['rep-001']);
  });

  it('ignora acento e caixa', () => {
    expect(filterMentionCandidates(sellers, 'JOAO').map(c => c.uid)).toEqual(['sdr-001']);
  });

  it('lista todo mundo quando a busca está vazia', () => {
    expect(filterMentionCandidates(sellers, '')).toHaveLength(4);
  });

  it('nunca sugere o próprio autor', () => {
    const r = filterMentionCandidates(sellers, '', { excludeUid: 'sdr-001' });
    expect(r.map(c => c.uid)).not.toContain('sdr-001');
  });

  it('esconde quem já foi mencionado no corpo', () => {
    const r = filterMentionCandidates(sellers, '', { alreadyMentioned: ['rep-001'] });
    expect(r.map(c => c.uid)).not.toContain('rep-001');
  });

  it('respeita o limite de sugestões', () => {
    expect(filterMentionCandidates(sellers, '', { limit: 2 })).toHaveLength(2);
  });

  it('devolve vazio quando nada casa', () => {
    expect(filterMentionCandidates(sellers, 'zzz')).toEqual([]);
  });
});

describe('newMentions', () => {
  it('lista só quem passou a ser mencionado', () => {
    expect(newMentions(['rep-001'], ['rep-001', 'sdr-001'])).toEqual(['sdr-001']);
  });

  it('reeditar sem mudar as menções não notifica ninguém', () => {
    expect(newMentions(['rep-001'], ['rep-001'])).toEqual([]);
  });

  it('remover menção não gera notificação', () => {
    expect(newMentions(['rep-001', 'sdr-001'], ['rep-001'])).toEqual([]);
  });

  it('nota nova notifica todos os mencionados', () => {
    expect(newMentions(undefined, ['rep-001', 'sdr-001'])).toEqual(['rep-001', 'sdr-001']);
  });
});
