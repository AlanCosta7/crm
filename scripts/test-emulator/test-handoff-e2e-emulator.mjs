/**
 * test-handoff-e2e-emulator.mjs — Reproduz o fluxo COMPLETO de passagem de bastão
 * no EMULADOR (rules reais + functions reais), exatamente como o front faz:
 *
 *   1. [admin] seed: users (sdr/rep) + deal atribuído ao sdr
 *   2. [sdr]   as 2 escritas de onHandoffConfirm (update deal + create handoff)
 *   3. [rep]   callable acceptHandoff
 *   4. [rep]   callable declineHandoff em um segundo handoff (fluxo de recusa)
 *
 * Uso: firebase emulators:exec --only auth,firestore,functions --project demo-wizmart \
 *        "node scripts/test-emulator/test-handoff-e2e-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, collection, addDoc, getDoc,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();

const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8081);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
const functions = getFunctions(app, 'southamerica-east1');
connectFunctionsEmulator(functions, '127.0.0.1', 5002);

function step(label, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
}

async function loginAs(uid, role, productIds) {
  const token = await admin.auth().createCustomToken(uid, { tenantId: TENANT, role, productIds });
  await signInWithCustomToken(auth, token);
}

// ── 1. Seed via admin ──────────────────────────────────────────────────────────
await adb.doc(`tenants/${TENANT}/users/sdr-1`).set({ name: 'SDR Teste', role: 'sdr', productIds: ['wizmart'] });
await adb.doc(`tenants/${TENANT}/users/rep-1`).set({ name: 'Rep Teste', role: 'rep', productIds: ['wizmart'] });

async function makeDeal(suffix) {
  const ref = await adb.collection(`tenants/${TENANT}/deals`).add({
    name: `Deal E2E ${suffix}`, company: 'Empresa Teste', value: 0,
    stage: 'qualificacao', funnelId: 'wizmart_farmer', funnelType: 'farmer',
    productId: 'wizmart', owner: 'sdr-1', assignedSdrId: 'sdr-1',
    status: 'open', due: '—', tasks: { e: false, w: false, m: false },
    createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}
const dealA = await makeDeal('accept');
const dealB = await makeDeal('decline');
step('1. [admin] seed de users + 2 deals', true);

// ── 2. SDR: escritas de onHandoffConfirm ──────────────────────────────────────
await loginAs('sdr-1', 'sdr', ['wizmart']);
const visitAt = new Date(Date.now() + 2 * 24 * 3600 * 1000);

async function sdrHandoff(dealId) {
  await updateDoc(doc(db, 'tenants', TENANT, 'deals', dealId), {
    stage: 'conectado_ao_representante', handoffStatus: 'pending',
    priorityChannel: 'whatsapp', visitType: 'presential',
    visitScheduledAt: visitAt, assignedRepId: 'rep-1',
    handoffNotes: 'teste e2e', updatedAt: new Date(),
  });
  const hRef = await addDoc(collection(db, 'tenants', TENANT, 'handoffs'), {
    dealId, productId: 'wizmart', fromSdrId: 'sdr-1', toRepId: 'rep-1',
    priorityChannel: 'whatsapp', visitType: 'presential',
    visitScheduledAt: visitAt, notes: 'teste e2e',
    status: 'pending_rep_acceptance', createdAt: new Date(),
  });
  return hRef.id;
}

let handoffA, handoffB;
try {
  handoffA = await sdrHandoff(dealA);
  handoffB = await sdrHandoff(dealB);
  step('2. [sdr] onHandoffConfirm (update deal + create handoff) ×2', true);
} catch (e) {
  step('2. [sdr] onHandoffConfirm', false, `${e.code}: ${e.message}`);
  process.exit(1);
}

// ── 3. Rep aceita ─────────────────────────────────────────────────────────────
await loginAs('rep-1', 'rep', ['wizmart']);
try {
  const res = await httpsCallable(functions, 'acceptHandoff')({ handoffId: handoffA, tenantId: TENANT });
  step('3. [rep] acceptHandoff', true, JSON.stringify(res.data));
} catch (e) {
  step('3. [rep] acceptHandoff', false, `${e.code}: ${e.message}`);
}

// ── 4. Rep recusa o segundo ───────────────────────────────────────────────────
try {
  const res = await httpsCallable(functions, 'declineHandoff')({ handoffId: handoffB, tenantId: TENANT, reason: 'teste' });
  step('4. [rep] declineHandoff', true, JSON.stringify(res.data));
} catch (e) {
  step('4. [rep] declineHandoff', false, `${e.code}: ${e.message}`);
}

// ── Estado final ──────────────────────────────────────────────────────────────
const hA = (await getDoc(doc(db, 'tenants', TENANT, 'handoffs', handoffA))).data();
const hB = (await getDoc(doc(db, 'tenants', TENANT, 'handoffs', handoffB))).data();
console.log(`Estado final: A=${hA?.status} B=${hB?.status}`);
process.exit(0);
