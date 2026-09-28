/**
 * Testes das Security Rules de `user_sessions` (PLANO_DESENHO_CRM.md Fase 6.1).
 * A auditoria de login/logoff só faz sentido se o client NUNCA puder escrever
 * o próprio registro — IP e user-agent seriam adivinhação, não fato. Toda
 * escrita sai de `logSessionEvent`/`endUserSession` via Admin SDK, que ignora
 * rules; `write: if false` aqui garante que nenhum outro caminho existe.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const SESSION_ID = 'sess-001';

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
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `tenants/${TID}/user_sessions/${SESSION_ID}`), {
      uid: 'sdr-001',
      userName: 'João SDR',
      userRole: 'sdr',
      event: 'login',
      at: serverTimestamp(),
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
    });
  });
});

describe('user_sessions — leitura', () => {
  it('master lê a auditoria', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/user_sessions/${SESSION_ID}`)));
  });

  it('manager lê a auditoria', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/user_sessions/${SESSION_ID}`)));
  });

  it('sdr não lê nem a própria sessão — auditoria é só de quem gerencia', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/user_sessions/${SESSION_ID}`)));
  });

  it('manager também lista a coleção inteira', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertSucceeds(getDocs(collection(db, `tenants/${TID}/user_sessions`)));
  });

  it('usuário de outro tenant nunca lê', async () => {
    const outro = env.authenticatedContext('x', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(doc(outro.firestore(), `tenants/${TID}/user_sessions/${SESSION_ID}`)));
  });
});

describe('user_sessions — escrita (sempre negada ao client)', () => {
  it('master não cria um evento diretamente — só a Cloud Function pode', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertFails(
      setDoc(doc(db, `tenants/${TID}/user_sessions/forjado`), {
        uid: 'master-001', userName: 'x', userRole: 'master', event: 'login', at: serverTimestamp(),
      })
    );
  });

  it('o próprio usuário não forja o próprio login', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(
      setDoc(doc(db, `tenants/${TID}/user_sessions/forjado2`), {
        uid: 'sdr-001', userName: 'João SDR', userRole: 'sdr', event: 'login', at: serverTimestamp(),
      })
    );
  });
});
