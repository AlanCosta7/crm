/**
 * fixtures.ts — apoio comum aos testes de Security Rules
 *
 * Desde a Fase 0 do PLANO_DESENHO_CRM.md, `isTenant()` consulta o documento do
 * usuário (`isActiveUser`) para negar acesso a quem foi bloqueado. Consequência
 * direta: **todo contexto autenticado num teste de rules precisa ter perfil**,
 * ou é negado antes de a regra da coleção sequer ser avaliada — que é
 * exatamente o comportamento desejado em produção, e a razão de os fixtures
 * passarem a semear `users/{uid}`.
 */

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

/** uids usados pelos testes de rules, com o papel que cada um representa. */
export const RULES_TEST_USERS: Record<string, string> = {
  'master-001':  'master',
  'manager-001': 'manager',
  'bdr-001':     'bdr',
  'sdr-001':     'sdr',
  'sdr-002':     'sdr',
  'rep-001':     'rep',
  'design-001':  'design',
  'viewer-001':  'viewer',
};

/**
 * Semeia os perfis em `tenants/{tid}/users`. Chamar no `beforeEach`, DEPOIS do
 * `clearFirestore()`.
 *
 * `extra` permite sobrescrever um perfil — o caso de uso é justamente criar um
 * usuário bloqueado: `seedRulesUsers(env, TID, { 'rep-001': { isActive: false } })`.
 */
export async function seedRulesUsers(
  env: RulesTestEnvironment,
  tid: string,
  extra: Record<string, Record<string, unknown>> = {},
): Promise<void> {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, role] of Object.entries(RULES_TEST_USERS)) {
      await setDoc(doc(db, `tenants/${tid}/users/${uid}`), {
        uid,
        name: uid,
        email: `${uid}@wizmart.com.br`,
        role,
        productIds: ['wizmart', 'smart_cafe'],
        isActive: true,
        ...(extra[uid] ?? {}),
      });
    }
  });
}
