import { describe, it, expect } from 'vitest';
import {
  toggleWrap,
  toggleBulletList,
  toggleOrderedList,
  toggleChecklist,
  toggleQuote,
  insertLink,
  toggleCode,
  toggleChecklistItem,
  countChecklistItems,
  markdownToPlainText,
} from './markdownEdit';

describe('toggleWrap', () => {
  it('envolve a seleção com o marcador', () => {
    const r = toggleWrap('cliente pediu desconto', { start: 8, end: 13 }, '**');
    expect(r.text).toBe('cliente **pediu** desconto');
    expect(r.text.slice(r.start, r.end)).toBe('pediu');
  });

  it('remove o marcador quando ele está por fora da seleção', () => {
    const r = toggleWrap('cliente **pediu** desconto', { start: 10, end: 15 }, '**');
    expect(r.text).toBe('cliente pediu desconto');
    expect(r.text.slice(r.start, r.end)).toBe('pediu');
  });

  it('remove o marcador quando ele está dentro da seleção', () => {
    const r = toggleWrap('cliente **pediu** desconto', { start: 8, end: 17 }, '**');
    expect(r.text).toBe('cliente pediu desconto');
  });

  it('sem seleção, insere o par e deixa o cursor no meio', () => {
    const r = toggleWrap('ok', { start: 2, end: 2 }, '**');
    expect(r.text).toBe('ok****');
    expect(r.start).toBe(4);
    expect(r.end).toBe(4);
  });
});

describe('prefixos de linha', () => {
  it('transforma as linhas selecionadas em lista', () => {
    const r = toggleBulletList('um\ndois', { start: 0, end: 7 });
    expect(r.text).toBe('- um\n- dois');
  });

  it('remove a lista quando todas as linhas já têm o prefixo', () => {
    const r = toggleBulletList('- um\n- dois', { start: 0, end: 11 });
    expect(r.text).toBe('um\ndois');
  });

  it('numera a lista ordenada', () => {
    const r = toggleOrderedList('um\ndois\ntres', { start: 0, end: 12 });
    expect(r.text).toBe('1. um\n2. dois\n3. tres');
  });

  it('cria checklist', () => {
    const r = toggleChecklist('ligar\nenviar proposta', { start: 0, end: 21 });
    expect(r.text).toBe('- [ ] ligar\n- [ ] enviar proposta');
  });

  it('remove checklist já marcada', () => {
    const r = toggleChecklist('- [x] ligar', { start: 0, end: 11 });
    expect(r.text).toBe('ligar');
  });

  it('aplica citação só na linha do cursor', () => {
    const r = toggleQuote('primeira\nsegunda', { start: 10, end: 10 });
    expect(r.text).toBe('primeira\n> segunda');
  });
});

describe('insertLink', () => {
  it('usa a seleção como rótulo e posiciona o cursor na URL', () => {
    const r = insertLink('ver proposta', { start: 4, end: 12 });
    expect(r.text).toBe('ver [proposta]()');
    expect(r.start).toBe(15);
    expect(r.end).toBe(15);
  });

  it('sem seleção, insere o esqueleto com o rótulo selecionado', () => {
    const r = insertLink('', { start: 0, end: 0 });
    expect(r.text).toBe('[texto]()');
    expect(r.text.slice(r.start, r.end)).toBe('texto');
  });

  it('preenche a URL quando ela é conhecida (colar link)', () => {
    const r = insertLink('site', { start: 0, end: 4 }, 'https://wizmart.com.br');
    expect(r.text).toBe('[site](https://wizmart.com.br)');
    expect(r.text.slice(r.start, r.end)).toBe('https://wizmart.com.br');
  });
});

describe('toggleCode', () => {
  it('usa crase simples em seleção de uma linha', () => {
    expect(toggleCode('valor x', { start: 6, end: 7 }).text).toBe('valor `x`');
  });

  it('usa bloco cercado em seleção multilinha', () => {
    const r = toggleCode('a\nb', { start: 0, end: 3 });
    expect(r.text).toBe('```\na\nb\n```');
    expect(r.text.slice(r.start, r.end)).toBe('a\nb');
  });
});

describe('checklist interativa', () => {
  const body = '- [ ] ligar\n- [x] enviar\n- [ ] agendar';

  it('marca o item pelo índice', () => {
    expect(toggleChecklistItem(body, 0)).toBe('- [x] ligar\n- [x] enviar\n- [ ] agendar');
  });

  it('desmarca item já marcado', () => {
    expect(toggleChecklistItem(body, 1)).toBe('- [ ] ligar\n- [ ] enviar\n- [ ] agendar');
  });

  it('não mexe em nada quando o índice não existe', () => {
    expect(toggleChecklistItem(body, 9)).toBe(body);
  });

  it('conta os itens', () => {
    expect(countChecklistItems(body)).toBe(3);
    expect(countChecklistItems('sem checklist')).toBe(0);
  });

  it('ignora colchetes que não são checklist', () => {
    const t = 'veja [x] no contrato';
    expect(toggleChecklistItem(t, 0)).toBe(t);
  });
});

describe('markdownToPlainText', () => {
  it('remove marcação e colapsa espaços', () => {
    const md = '## Reunião\n\nCliente pediu **desconto** de _10%_ e o [contrato](https://x.com).\n\n- [ ] enviar\n- [x] ligar';
    expect(markdownToPlainText(md)).toBe('Reunião Cliente pediu desconto de 10% e o contrato. enviar ligar');
  });

  it('remove bloco de código inteiro', () => {
    expect(markdownToPlainText('antes\n```\nvar x = 1\n```\ndepois')).toBe('antes depois');
  });

  it('remove citação e linha horizontal', () => {
    expect(markdownToPlainText('> citado\n\n---\n\nfim')).toBe('citado fim');
  });

  it('devolve string vazia para corpo vazio', () => {
    expect(markdownToPlainText('')).toBe('');
  });
});
