/**
 * test-deal-timeline-emulator.mjs — valida o rastreio da passagem de bastão
 * em `deal_timeline/{dealId}/events` (Fase C do
 * PLANO_CARD_ASSINATURAS_VISIBILIDADE.md).
 *
 * Cobre: oferta SDR→Rep (onHandoffCreated), aceite (acceptHandoff), recusa
 * (declineHandoff), devolução ao BDR e reativação (onDealTimelineEvents).
 * Atribuição automática BDR→SDR (dailyCadenceEngine) não é coberta aqui —
 * é `onSchedule`, sem invocação simples via client SDK; o batch.set do
 * evento usa o mesmo padrão já provado nos outros 3 cenários.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart \
 *        "node scripts/test-emulator/test-deal-timeline-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, collection, addDoc,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken, signOut } from 'firebase/auth';
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

async function loginAs(uid, role) {
  await signOut(auth).catch(() => {});
  const token = await admin.auth().createCustomToken(uid, { tenantId: TENANT, role, productIds: ['wizmart'] });
  await signInWithCustomToken(auth, token);
}

async function seedUser(uid, role, name) {
  await adb.doc(`tenants/${TENANT}/users/${uid}`).set({ id: uid, role, name, isActive: true }, { merge: true });
}

async function makeDeal(fields) {
  const ref = await adb.collection(`tenants/${TENANT}/deals`).add({
    name: 'Deal Timeline', company: 'X', value: 0, stage: 'qualificacao',
    funnelId: 'f1', funnelType: 'farmer', productId: 'wizmart',
    due: '—', status: 'open', tasks: { e: false, w: false, m: false },
    createdAt: new Date(), updatedAt: new Date(),
    ...fields,
  });
  return ref;
}

async function waitForEvent(dealId, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await adb.collection(`tenants/${TENANT}/deal_timeline`).doc(dealId).collection('events').get();
    const events = snap.docs.map(d => d.data());
    const found = events.find(predicate);
    if (found) return found;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

let allOk = true;
async function check(label, dealId, predicate) {
  const found = await waitForEvent(dealId, predicate);
  const ok = found !== null;
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${ok ? ` — "${found.message}"` : ' — evento não encontrado'}`);
}

await seedUser('sdr-tl-1', 'sdr', 'Sara SDR');
await seedUser('rep-tl-1', 'rep', 'Rico Rep');
await seedUser('rep-tl-2', 'rep', 'Rita Rep');
await seedUser('bdr-tl-1', 'bdr', 'Beto BDR');
await seedUser('mgr-tl-1', 'manager', 'Marta Gestora');

// ── 1. Oferta + aceite (onHandoffCreated + acceptHandoff) ──────────────────
const d1 = await makeDeal({ owner: 'sdr-tl-1', bdrId: 'bdr-tl-1', assignedSdrId: 'sdr-tl-1', participantIds: ['bdr-tl-1', 'sdr-tl-1'] });
await loginAs('sdr-tl-1', 'sdr');
const h1Ref = await addDoc(collection(db, 'tenants', TENANT, 'handoffs'), {
  dealId: d1.id, productId: 'wizmart', fromSdrId: 'sdr-tl-1', toRepId: 'rep-tl-1',
  priorityChannel: 'whatsapp', visitType: 'presential',
  visitScheduledAt: new Date(Date.now() + 86400000), notes: 'teste',
  status: 'pending_rep_acceptance', createdAt: new Date(),
});
await check('1a. Oferta SDR→Rep gravou evento na timeline', d1.id, e => e.type === 'handoff_offered');

await loginAs('rep-tl-1', 'rep');
const acceptFn = httpsCallable(functions, 'acceptHandoff');
await acceptFn({ handoffId: h1Ref.id, tenantId: TENANT });
await check('1b. Aceite do Rep gravou evento na timeline', d1.id, e => e.type === 'handoff_accepted');

// ── 2. Recusa (declineHandoff) ──────────────────────────────────────────────
const d2 = await makeDeal({ owner: 'sdr-tl-1', bdrId: 'bdr-tl-1', assignedSdrId: 'sdr-tl-1', participantIds: ['bdr-tl-1', 'sdr-tl-1'] });
await loginAs('sdr-tl-1', 'sdr');
const h2Ref = await addDoc(collection(db, 'tenants', TENANT, 'handoffs'), {
  dealId: d2.id, productId: 'wizmart', fromSdrId: 'sdr-tl-1', toRepId: 'rep-tl-2',
  priorityChannel: 'email', visitType: 'video',
  visitScheduledAt: new Date(Date.now() + 86400000), notes: 'teste 2',
  status: 'pending_rep_acceptance', createdAt: new Date(),
});
await loginAs('rep-tl-2', 'rep');
const declineFn = httpsCallable(functions, 'declineHandoff');
await declineFn({ handoffId: h2Ref.id, tenantId: TENANT, reason: 'Fora da minha região' });
await check('2. Recusa do Rep gravou evento na timeline', d2.id, e => e.type === 'handoff_declined');

// ── 3. Devolução ao BDR + reativação (onDealTimelineEvents) ────────────────
const d3 = await makeDeal({ owner: 'bdr-tl-1', bdrId: 'bdr-tl-1', assignedSdrId: 'sdr-tl-1', participantIds: ['bdr-tl-1', 'sdr-tl-1'] });
await loginAs('sdr-tl-1', 'sdr');
await updateDoc(doc(db, 'tenants', TENANT, 'deals', d3.id), {
  assignedSdrId: null, status: 'lost', lostReason: 'fechou_concorrente', requeuedForBdr: true, requeuedAt: new Date(), updatedAt: new Date(),
});
await check('3a. Devolução ao BDR gravou evento na timeline', d3.id, e => e.type === 'requeued_to_bdr');

await loginAs('bdr-tl-1', 'bdr');
await updateDoc(doc(db, 'tenants', TENANT, 'deals', d3.id), {
  status: 'in_queue', requeuedForBdr: false, updatedAt: new Date(),
});
await check('3b. Reativação pelo BDR gravou evento na timeline', d3.id, e => e.type === 'reactivated_by_bdr');

console.log(allOk ? '\n🎉 TODOS os eventos de timeline validados' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
