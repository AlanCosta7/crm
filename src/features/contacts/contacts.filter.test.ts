/**
 * contacts.filter.test.ts
 *
 * Testa a lógica de filtro de contatos de forma puramente funcional,
 * sem dependência de DOM ou Firebase.
 * A função de filtro foi extraída para facilitar o teste.
 */

import { describe, it, expect } from 'vitest';
import type { Contact, ProductId } from '../../types/crm';

// ── Lógica de filtro (espelho do ContactsPage.getFilteredContacts) ─────────────
function filterContacts(
  contacts: Contact[],
  opts: {
    productId: ProductId;
    searchTerm?: string;
    filter?: string;
    currentUserId?: string;
  }
): Contact[] {
  const { productId, searchTerm = '', filter = 'Todos', currentUserId = '' } = opts;
  let result = [...contacts];

  // Filtro por produto
  if (productId !== 'wizmart') {
    result = result.filter(
      c => !c.productIds || c.productIds.length === 0 || c.productIds.includes(productId)
    );
  }

  // Filtro por texto
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(
      c =>
        c.name.toLowerCase().includes(term) ||
        c.company.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term)
    );
  }

  // Filtros de chip
  if (filter === 'Meus contatos')     result = result.filter(c => c.owner === currentUserId);
  if (filter === 'Sem negócio')       result = result.filter(c => c.deals === 0);
  if (filter === 'Adicionados hoje')  result = result.filter(c => c.last === 'agora' || c.last.includes('horas'));

  return result;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const C = (overrides: Partial<Contact> & { id: string }): Contact => ({
  name: 'Contato Teste',
  role: 'Gerente',
  company: 'Empresa ABC',
  email: 'contato@empresa.com',
  phone: '',
  whats: '',
  owner: 'uid-sdr',
  last: 'há 3 dias',
  tags: [],
  deals: 1,
  productIds: ['wizmart'],
  ...overrides,
});

const contacts: Contact[] = [
  C({ id: 'c1', name: 'João Victor',  company: 'WizDist',    productIds: ['wizmart'],               deals: 2 }),
  C({ id: 'c2', name: 'Ana Café',     company: 'Padaria SC', productIds: ['smart_cafe'],            deals: 0 }),
  C({ id: 'c3', name: 'Carlos Multi', company: 'Grupo ABC',  productIds: ['wizmart', 'smart_cafe'], deals: 1 }),
  C({ id: 'c4', name: 'Pedro Sem',    company: 'Geral',      productIds: [],                        deals: 0, owner: 'uid-me', last: 'agora' }),
];

// ── Filtro de produto ─────────────────────────────────────────────────────────
describe('filterContacts — produto', () => {
  it('wizmart retorna todos (sem filtro de produto)', () => {
    const r = filterContacts(contacts, { productId: 'wizmart' });
    expect(r).toHaveLength(4); // todos passam
  });

  it('smart_cafe retorna apenas smart_cafe e multi e sem productIds', () => {
    const r = filterContacts(contacts, { productId: 'smart_cafe' });
    const ids = r.map(c => c.id);
    expect(ids).toContain('c2'); // só smart_cafe
    expect(ids).toContain('c3'); // multi
    expect(ids).toContain('c4'); // sem productIds — mostra em todos
    expect(ids).not.toContain('c1'); // só wizmart — excluído
  });

  it('contato sem productIds aparece em qualquer produto', () => {
    const r = filterContacts(contacts, { productId: 'smart_cafe' });
    expect(r.find(c => c.id === 'c4')).toBeDefined();
  });
});

// ── Busca por texto ───────────────────────────────────────────────────────────
describe('filterContacts — busca por texto', () => {
  it('encontra por nome (case-insensitive)', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', searchTerm: 'joão' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('c1');
  });

  it('encontra por empresa', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', searchTerm: 'wiz' });
    expect(r[0].company).toContain('WizDist');
  });

  it('encontra por email', () => {
    const specificContacts = [C({ id: 'e1', email: 'joao@empresa.com', name: 'Teste' })];
    const r = filterContacts(specificContacts, { productId: 'wizmart', searchTerm: 'joao@' });
    expect(r).toHaveLength(1);
  });

  it('retorna vazio para termo inexistente', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', searchTerm: 'zzz_nao_existe' });
    expect(r).toHaveLength(0);
  });
});

// ── Filtros de chip ───────────────────────────────────────────────────────────
describe('filterContacts — chips', () => {
  it('"Sem negócio" filtra deals === 0', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', filter: 'Sem negócio' });
    expect(r.every(c => c.deals === 0)).toBe(true);
  });

  it('"Meus contatos" filtra pelo uid atual', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', filter: 'Meus contatos', currentUserId: 'uid-me' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('c4');
  });

  it('"Adicionados hoje" inclui last === agora', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', filter: 'Adicionados hoje' });
    expect(r.some(c => c.last === 'agora')).toBe(true);
  });

  it('"Todos" não aplica filtro adicional', () => {
    const r = filterContacts(contacts, { productId: 'wizmart', filter: 'Todos' });
    expect(r).toHaveLength(4);
  });
});

// ── Combinação de filtros ─────────────────────────────────────────────────────
describe('filterContacts — filtros combinados', () => {
  it('produto + busca reduzem o resultado corretamente', () => {
    const r = filterContacts(contacts, { productId: 'smart_cafe', searchTerm: 'café' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('c2');
  });

  it('produto + "Sem negócio" correto', () => {
    const r = filterContacts(contacts, { productId: 'smart_cafe', filter: 'Sem negócio' });
    // c2 (smart_cafe, deals=0), c4 (sem productIds, deals=0)
    expect(r.every(c => c.deals === 0)).toBe(true);
  });
});
