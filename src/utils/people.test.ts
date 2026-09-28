import { describe, it, expect } from 'vitest';
import { mergePeople } from './people';
import { sellerById } from './crmFormat';

const legacy = [{ id: 's1', name: 'Ana Legada', initials: 'AL', color: '#111111' }];

describe('mergePeople', () => {
  it('usuário que só existe em `users` (convidado) passa a ter nome — antes era "Desconhecido"', () => {
    const people = mergePeople([{ id: 'uid-9', name: 'João Luís', initials: 'JL', color: '#B45309' }], legacy);
    expect(sellerById(people, 'uid-9').name).toBe('João Luís');
  });

  it('id só do legado continua resolvendo', () => {
    expect(sellerById(mergePeople([], legacy), 's1').name).toBe('Ana Legada');
  });

  it('id nos dois: `users` vence (nome atual, não o do v1)', () => {
    const people = mergePeople([{ id: 's1', name: 'Ana Atual', initials: 'AA', color: '#222222' }], legacy);
    expect(sellerById(people, 's1').name).toBe('Ana Atual');
  });

  it('sem initials/color no usuário: deriva das iniciais do nome e usa cor neutra', () => {
    const p = sellerById(mergePeople([{ id: 'u1', name: 'Lara Jornada Garcia' }], []), 'u1');
    expect(p.initials).toBe('LJ');
    expect(p.color).toBe('#6B7280');
  });

  it('usuário sem nome ou sem id é ignorado; id inexistente segue "Desconhecido"', () => {
    const people = mergePeople([{ id: 'u1' }, { name: 'Sem Id' }], []);
    expect(people).toEqual([]);
    expect(sellerById(people, 'nao-existe').name).toBe('Desconhecido');
  });
});
