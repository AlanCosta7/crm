import { describe, it, expect } from 'vitest';
import { mergeNoteFeed, canEditNote, canDeleteNote, toDate, type NoteFeedItem } from './noteFeed';
import type { Activity, Note } from '../../../types/crm';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  tenantId: 'wizmart',
  entityType: 'deal',
  entityId: 'deal-001',
  dealId: 'deal-001',
  productId: 'wizmart',
  authorId: 'sdr-001',
  body: 'texto',
  attachments: [],
  createdAt: ts('2026-08-30T10:00:00Z'),
  ...over,
});

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  dealId: 'deal-001',
  userId: 'rep-001',
  type: 'note',
  status: 'completed',
  coinsAwarded: 0,
  text: 'nota antiga',
  createdAt: ts('2026-08-29T10:00:00Z'),
  ...over,
});

describe('toDate', () => {
  it('converte Timestamp do Firestore', () => {
    expect(toDate(ts('2026-08-30T10:00:00Z'))?.toISOString()).toBe('2026-08-30T10:00:00.000Z');
  });

  it('aceita Date e string ISO', () => {
    // comparação em UTC: o fuso do Brasil jogaria 01/01 00:00Z para 31/12 local
    expect(toDate(new Date('2026-01-01T00:00:00Z'))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(toDate('2026-01-01T00:00:00Z')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('devolve null para vazio ou data inválida', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('não é data')).toBeNull();
  });
});

describe('mergeNoteFeed', () => {
  it('mistura as duas origens da mais recente para a mais antiga', () => {
    const feed = mergeNoteFeed([note()], [act()]);
    expect(feed.map(i => i.origin)).toEqual(['note', 'legacy']);
  });

  it('marca a origem certa em cada item', () => {
    const feed = mergeNoteFeed([note()], [act()]);
    expect(feed[0]).toMatchObject({ origin: 'note', authorId: 'sdr-001', body: 'texto' });
    expect(feed[1]).toMatchObject({ origin: 'legacy', authorId: 'rep-001', body: 'nota antiga' });
  });

  it('descarta activity que é espelho de nota (evita duplicata)', () => {
    const espelho = { ...act({ id: 'a2' }), noteId: 'n1' } as Activity;
    const feed = mergeNoteFeed([note()], [act(), espelho]);
    expect(feed).toHaveLength(2);
    expect(feed.some(i => i.id === 'a2')).toBe(false);
  });

  it('ignora activity sem texto', () => {
    const feed = mergeNoteFeed([], [act({ id: 'a3', text: '   ' }), act()]);
    expect(feed.map(i => i.id)).toEqual(['a1']);
  });

  it('ignora nota sem id', () => {
    expect(mergeNoteFeed([note({ id: undefined })], [])).toHaveLength(0);
  });

  it('joga item sem data para o fim', () => {
    const feed = mergeNoteFeed([note({ id: 'sem-data', createdAt: null }), note()], []);
    expect(feed.map(i => i.id)).toEqual(['n1', 'sem-data']);
  });

  it('devolve lista vazia sem nenhuma origem', () => {
    expect(mergeNoteFeed([], [])).toEqual([]);
  });

  it('preserva anexos e editedAt da nota', () => {
    const [item] = mergeNoteFeed(
      [note({ editedAt: ts('2026-08-31T09:00:00Z'), attachments: [{ id: 'x' } as never] })],
      []
    );
    expect(item.attachments).toHaveLength(1);
    expect(item.editedAt?.toISOString()).toBe('2026-08-31T09:00:00.000Z');
  });
});

describe('permissões da nota', () => {
  const [minha] = mergeNoteFeed([note()], []);
  const [antiga] = mergeNoteFeed([], [act()]);

  it('autor edita a própria nota', () => {
    expect(canEditNote(minha, 'sdr-001')).toBe(true);
  });

  it('outra pessoa não edita', () => {
    expect(canEditNote(minha, 'rep-001')).toBe(false);
  });

  it('nota legada não é editável por ninguém', () => {
    expect(canEditNote(antiga, 'rep-001')).toBe(false);
  });

  it('autor exclui a sua', () => {
    expect(canDeleteNote(minha, 'sdr-001', 'sdr')).toBe(true);
  });

  it('master exclui de terceiros (moderação)', () => {
    expect(canDeleteNote(minha, 'master-001', 'master')).toBe(true);
  });

  it('master não edita nota de terceiros', () => {
    expect(canEditNote(minha, 'master-001')).toBe(false);
  });

  it('manager não exclui nota de terceiros', () => {
    expect(canDeleteNote(minha, 'manager-001', 'manager')).toBe(false);
  });

  it('nota legada não é excluível pela aba', () => {
    expect(canDeleteNote(antiga, 'master-001', 'master')).toBe(false);
  });

  it('sem uid não edita nem exclui', () => {
    const orfa: NoteFeedItem = { ...minha, authorId: '' };
    expect(canEditNote(orfa, undefined)).toBe(false);
    expect(canDeleteNote(orfa, undefined, 'sdr')).toBe(false);
  });
});
