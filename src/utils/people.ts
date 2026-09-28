/**
 * people.ts — nome/avatar de quem aparece nos cards (responsável, histórico…).
 *
 * As telas resolviam nomes só pela coleção legada `sellers` (v1). Usuários
 * criados depois — todos os convidados pelo admin — existem apenas em `users`,
 * então qualquer card deles mostrava "Desconhecido". Foi isso que fez a troca de
 * responsável parecer quebrada: a escrita funcionava, mas o nome novo nunca
 * aparecia. Aqui os `users` (fonte de verdade, com o uid como id) têm prioridade
 * e `sellers` só completa ids antigos que ainda não migraram.
 */
import type { Seller } from '../types/crm';

interface PersonLike {
  id?: string;
  name?: string;
  initials?: string;
  color?: string;
}

const FALLBACK_COLOR = '#6B7280';

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/** Lista no formato `Seller`, pronta para `sellerById`. `users` vence `sellers` quando o id existe nos dois. */
export function mergePeople(users: PersonLike[], sellers: Seller[]): Seller[] {
  const byId = new Map<string, Seller>();
  for (const u of users) {
    if (!u.id || !u.name) continue;
    byId.set(u.id, { id: u.id, name: u.name, initials: u.initials || initialsOf(u.name), color: u.color || FALLBACK_COLOR });
  }
  for (const s of sellers) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()];
}
