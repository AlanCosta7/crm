/**
 * test-session-audit-emulator.mjs — Valida a Fase 6.1 do PLANO_DESENHO_CRM.md:
 * as callables `logSessionEvent` e `endUserSession` no EMULADOR (rules reais
 * + functions reais), exatamente como o front chama.
 *
 * Cenários:
 *  1. [sdr] logSessionEvent({event:'login'}) grava o evento e atualiza
 *     users/{uid}.lastLoginAt.
 *  2. [sdr] logSessionEvent({event:'logout'}) grava o evento (sem tocar lastLoginAt).
 *  3. [sdr] event inválido é rejeitado (invalid-argument).
 *  4. [manager] endUserSession({targetUid: sdr}) revoga os refresh tokens do alvo.
 *  5. [sdr] endUserSession de outro usuário é negado (permission-denied) — sdr
 *     não é master nem manager.
 *  6. [master] endUserSession(self) é negado — não dá pra se auto-derrubar.
 *  7. Cliente nunca lê a própria coleção (rules) — sdr não lê user_sessions.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-session-audit-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, collection, getDocs, query, where,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();
const aauth = admin.auth();

const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8081);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
const functions = getFunctions(app, 'southamerica-east1');
connectFunctionsEmulator(functions, '127.0.0.1', 5002);

let allOk = true;
function step(label, ok, extra = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${extra ? ' — ' + extra : ''}`);
}

async function loginAs(uid, role) {
  const token = await admin.auth().createCustomToken(uid, { tenantId: TENANT, role });
  await signInWithCustomToken(auth, token);
}

async function seedUser(uid, name, role) {
  try { await aauth.deleteUser(uid); } catch { /* não existia */ }
  await aauth.createUser({ uid, email: `${uid}@wizmart.com.br`, password: 'senha_de_teste_123' });
  await aauth.setCustomUserClaims(uid, { tenantId: TENANT, role });
  await adb.doc(`tenants/${TENANT}/users/${uid}`).set({
    uid, name, email: `${uid}@wizmart.com.br`, role, productIds: ['wizmart'], isActive: true,
  });
}

async function sessionEventsFor(uid) {
  const snap = await adb.collection(`tenants/${TENANT}/user_sessions`)
    .where('uid', '==', uid).get();
  return snap.docs.map((d) => d.data());
}

// ── Seed ────────────────────────────────────────────────────────────────────
await seedUser('sdr-audit', 'João SDR', 'sdr');
await seedUser('manager-audit', 'Maria Manager', 'manager');
await seedUser('master-audit', 'Ricardo Master', 'master');
step('seed de 3 usuários (sdr/manager/master)', true);

// ── 1. logSessionEvent(login) ────────────────────────────────────────────────
await loginAs('sdr-audit', 'sdr');
try {
  await httpsCallable(functions, 'logSessionEvent')({ event: 'login' });
  const eventos = await sessionEventsFor('sdr-audit');
  const doc1 = eventos.find((e) => e.event === 'login');
  const userDoc = (await adb.doc(`tenants/${TENANT}/users/sdr-audit`).get()).data();
  step('1. [sdr] logSessionEvent(login) grava evento', !!doc1, JSON.stringify(doc1 ? { ip: doc1.ip, userAgent: doc1.userAgent } : null));
  step('1b. [sdr] login atualiza users/{uid}.lastLoginAt', !!userDoc?.lastLoginAt);
} catch (e) {
  step('1. [sdr] logSessionEvent(login)', false, `${e.code}: ${e.message}`);
}

// ── 2. logSessionEvent(logout) ───────────────────────────────────────────────
try {
  await httpsCallable(functions, 'logSessionEvent')({ event: 'logout' });
  const eventos = await sessionEventsFor('sdr-audit');
  const doc2 = eventos.find((e) => e.event === 'logout');
  step('2. [sdr] logSessionEvent(logout) grava evento', !!doc2);
} catch (e) {
  step('2. [sdr] logSessionEvent(logout)', false, `${e.code}: ${e.message}`);
}

// ── 3. event inválido é rejeitado ────────────────────────────────────────────
try {
  await httpsCallable(functions, 'logSessionEvent')({ event: 'revoked' });
  step('3. event inválido rejeitado', false, 'a chamada NÃO deveria ter sucedido');
} catch (e) {
  step('3. event inválido rejeitado', e.code === 'functions/invalid-argument', e.code);
}

// ── 4. [manager] endUserSession derruba o sdr ────────────────────────────────
const antesRevoke = await aauth.getUser('sdr-audit');
await loginAs('manager-audit', 'manager');
try {
  await httpsCallable(functions, 'endUserSession')({ targetUid: 'sdr-audit' });
  const depoisRevoke = await aauth.getUser('sdr-audit');
  const eventos = await sessionEventsFor('sdr-audit');
  const revoked = eventos.find((e) => e.event === 'revoked');
  step('4. [manager] endUserSession revoga refresh tokens do alvo',
    depoisRevoke.tokensValidAfterTime !== antesRevoke.tokensValidAfterTime);
  step('4b. [manager] endUserSession grava evento "revoked" com endedBy', !!revoked && revoked.endedBy === 'manager-audit',
    JSON.stringify(revoked ? { endedBy: revoked.endedBy, endedByName: revoked.endedByName } : null));

  const sdrDoc = (await adb.doc(`tenants/${TENANT}/users/sdr-audit`).get()).data();
  step('4c. [manager] endUserSession grava forceLogoutAt no doc do alvo — derruba sessão ativa sem esperar reload',
    !!sdrDoc?.forceLogoutAt);
} catch (e) {
  step('4. [manager] endUserSession', false, `${e.code}: ${e.message}`);
}

// ── 5. [sdr] endUserSession de outro é negado ────────────────────────────────
await loginAs('sdr-audit', 'sdr');
try {
  await httpsCallable(functions, 'endUserSession')({ targetUid: 'manager-audit' });
  step('5. [sdr] endUserSession de outro negado', false, 'a chamada NÃO deveria ter sucedido');
} catch (e) {
  step('5. [sdr] endUserSession de outro negado', e.code === 'functions/permission-denied', e.code);
}

// ── 6. [master] endUserSession(self) é negado ────────────────────────────────
await loginAs('master-audit', 'master');
try {
  await httpsCallable(functions, 'endUserSession')({ targetUid: 'master-audit' });
  step('6. [master] endUserSession(self) negado', false, 'a chamada NÃO deveria ter sucedido');
} catch (e) {
  step('6. [master] endUserSession(self) negado', e.code === 'functions/permission-denied', e.code);
}

// ── 7. Client nunca lê a coleção diretamente (rules) ─────────────────────────
await loginAs('sdr-audit', 'sdr');
try {
  await getDocs(query(collection(db, 'tenants', TENANT, 'user_sessions'), where('uid', '==', 'sdr-audit')));
  step('7. [sdr] leitura direta da coleção negada pelas rules', false, 'a leitura NÃO deveria ter sucedido');
} catch (e) {
  step('7. [sdr] leitura direta da coleção negada pelas rules', e.code === 'permission-denied', e.code);
}

console.log(allOk ? '\n🎉 Fase 6.1 validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
