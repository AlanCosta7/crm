import { describe, it, expect } from 'vitest';
import { resolveDealContact, contactsForDealCompany } from './dealContact';
import type { Contact } from '../types/crm';

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c1',
    name: 'Contato',
    role: '',
    company: 'Empresa X',
    email: '',
    phone: '',
    whats: '',
    owner: 'user-1',
    last: '',
    tags: [],
    deals: 0,
    ...overrides,
  };
}

describe('resolveDealContact', () => {
  it('resolve pelo contactId quando presente, ignorando a empresa', () => {
    const contacts = [
      contact({ id: 'c1', company: 'Empresa X' }),
      contact({ id: 'c2', company: 'Outra Empresa' }),
    ];
    const deal = { contactId: 'c2', company: 'Empresa X' };
    expect(resolveDealContact(deal, contacts)?.id).toBe('c2');
  });

  it('cai no fallback por nome da empresa quando contactId não está setado (deal legado)', () => {
    const contacts = [contact({ id: 'c1', company: 'Empresa X' })];
    const deal = { contactId: undefined, company: 'Empresa X' };
    expect(resolveDealContact(deal, contacts)?.id).toBe('c1');
  });

  it('NÃO cai no fallback quando contactId está setado mas não bate com nenhum contato', () => {
    const contacts = [contact({ id: 'c1', company: 'Empresa X' })];
    const deal = { contactId: 'contato-excluido', company: 'Empresa X' };
    expect(resolveDealContact(deal, contacts)).toBeUndefined();
  });

  it('devolve undefined quando não há contactId nem match por empresa', () => {
    const contacts = [contact({ id: 'c1', company: 'Outra Empresa' })];
    const deal = { contactId: undefined, company: 'Empresa X' };
    expect(resolveDealContact(deal, contacts)).toBeUndefined();
  });
});

describe('contactsForDealCompany', () => {
  it('filtra só os contatos da mesma empresa do negócio', () => {
    const contacts = [
      contact({ id: 'c1', company: 'Empresa X' }),
      contact({ id: 'c2', company: 'Empresa X' }),
      contact({ id: 'c3', company: 'Outra Empresa' }),
    ];
    const result = contactsForDealCompany({ company: 'Empresa X' }, contacts);
    expect(result.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('devolve lista vazia quando nenhum contato é da empresa', () => {
    const contacts = [contact({ id: 'c1', company: 'Outra Empresa' })];
    expect(contactsForDealCompany({ company: 'Empresa X' }, contacts)).toEqual([]);
  });
});
