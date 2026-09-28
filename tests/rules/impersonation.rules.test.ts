/**
 * Testes das Security Rules de "Visualizar como" — a única coisa que o
 * client toca diretamente é LEITURA de `active_impersonations` (é o que o
 * banner assina) e de `impersonation_log` (auditoria, master-only). Toda
 * escrita passa por Cloud Functions com Admin SDK, que ignora rules — por
 * isso `write: if false` nas duas coleções é o que garante que o client
 * nunca fabrica ou apaga um marcador de impersonação por conta própria.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const LOG_ID = 'log-001';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wizmart-crm-local',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
  });
}, 90000);

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // isTenant() consulta users/{uid} desde a Fase 0 — sem perfil, tudo é negado.
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `tenants/${TID}/active_impersonations/sdr-001`), {
      actorUid: 'master-001',
      actorName: 'Ricardo Master',
      targetName: 'João SDR',
      targetRole: 'sdr',
      startedAt: serverTimestamp(),
    });
    await setDoc(doc(c.firestore(), `tenants/${TID}/impersonation_log/${LOG_ID}`), {
      actorUid: 'master-001',
      actorName: 'Ricardo Master',
      targetUid: 'sdr-001',
      targetName: 'João SDR',
      targetRole: 'sdr',
      startedAt: serverTimestamp(),
    });
  });
});

describe('active_impersonations — leitura', () => {
  it('a própria pessoa impersonada lê o marcador dela', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/active_impersonations/sdr-001`)));
  });

  it('master lê o marcador de qualquer um', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/active_impersonations/sdr-001`)));
  });

  it('outro papel operacional não lê o marcador de terceiro', async () => {
    const db = ctx('rep-001', 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/active_impersonations/sdr-001`)));
  });

  it('manager não lê marcador de terceiro — só master tem essa exceção', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/active_impersonations/sdr-001`)));
  });

  it('usuário de outro tenant nunca lê', async () => {
    const outro = env.authenticatedContext('x', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(doc(outro.firestore(), `tenants/${TID}/active_impersonations/sdr-001`)));
  });
});

describe('active_impersonations — escrita (sempre negada ao client)', () => {
  it('master não cria o marcador diretamente — só a Cloud Function pode', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertFails(
      setDoc(doc(db, `tenants/${TID}/active_impersonations/rep-001`), {
        actorUid: 'master-001', actorName: 'x', targetName: 'y', targetRole: 'rep',
      })
    );
  });

  it('a própria pessoa impersonada não apaga o marcador na unha — passa por endImpersonation', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(deleteDoc(doc(db, `tenants/${TID}/active_impersonations/sdr-001`)));
  });
});

describe('impersonation_log', () => {
  it('master lê o histórico de auditoria', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/impersonation_log/${LOG_ID}`)));
  });

  it('ninguém além de master lê o log — nem o próprio impersonado', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/impersonation_log/qualquer`)));
  });

  it('client nunca escreve no log', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertFails(
      addDoc(collection(db, `tenants/${TID}/impersonation_log`), { actorUid: 'master-001' })
    );
  });
});
