/**
 * test-drop-denials-emulator.mjs — Prova as 2 causas-raiz dos bugs relatados:
 *   A. commitDrop escreve cohortKeys do cliente → notWritingCohortKeys() NEGA o move
 *   B. BDR (e Rep) confirmam handoff → rules de handoffs.create NEGAM (isSdr)
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json --only auth,firestore \
 *        --project demo-wizmart "node scripts/test-drop-denials-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, collection, addDoc,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

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

async function loginAs(uid, role) {
  const token = await admin.auth().createCustomToken(uid, { tenantId: TENANT, role, productIds: ['wizmart', 'smart_cafe'] });
  await signInWithCustomToken(auth, token);
}

async function expect(label, promise, expected /* 'ok' | 'denied' */) {
  try {
    await promise;
    const pass = expected === 'ok';
    console.log(`${pass ? '✅' : '🔴'} ${label} → PERMITIDO ${pass ? '(esperado)' : '(DEVERIA SER NEGADO)'}`);
  } catch (e) {
    const denied = e.code === 'permission-denied';
    const pass = expected === 'denied' && denied;
    console.log(`${pass ? '✅' : '🔴'} ${label} → ${denied ? 'NEGADO' : e.code} ${pass ? '(reproduz o bug)' : ''}`);
  }
}

async function makeDeal(name) {
  const ref = await adb.collection(`tenants/${TENANT}/deals`).add({
    name, company: 'X', value: 0, stage: 'qualificacao',
    funnelId: 'wizmart_farmer', funnelType: 'farmer', productId: 'wizmart',
    owner: 'sdr-1', assignedSdrId: 'sdr-1', status: 'open', due: '—',
    tasks: { e: false, w: false, m: false }, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

const d1 = await makeDeal('move com cohortKeys');
const d2 = await makeDeal('move sem cohortKeys');
const d3 = await makeDeal('handoff por bdr');

// A. commitDrop com cohortKeys (o que o front faz hoje ao mover p/ visita_agendada)
await loginAs('sdr-1', 'sdr');
await expect(
  'A1. [sdr] mover p/ visita_agendada ESCREVENDO cohortKeys (front hoje)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', d1), {
    stage: 'visita_agendada', updatedAt: new Date(),
    cohortKeys: { visitScheduledMonth: '2026-07' },
  }),
  'denied',
);
await expect(
  'A2. [sdr] mesmo move SEM cohortKeys (fix proposto)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', d2), {
    stage: 'visita_agendada', updatedAt: new Date(),
  }),
  'ok',
);

// B. handoff create por papel não-SDR
const handoffDoc = (dealId) => ({
  dealId, productId: 'wizmart', fromSdrId: 'bdr-1', toRepId: 'rep-1',
  priorityChannel: 'whatsapp', visitType: 'presential',
  visitScheduledAt: new Date(Date.now() + 86400000), notes: '',
  status: 'pending_rep_acceptance', createdAt: new Date(),
});
await loginAs('bdr-1', 'bdr');
await expect('B1. [bdr] criar handoff (modal deixa, rule nega)', addDoc(collection(db, 'tenants', TENANT, 'handoffs'), handoffDoc(d3)), 'denied');
await loginAs('rep-1', 'rep');
await expect('B2. [rep] criar handoff', addDoc(collection(db, 'tenants', TENANT, 'handoffs'), handoffDoc(d3)), 'denied');

// C. design consegue arrastar na UI (canMoveDeal) mas update é negado
await loginAs('design-1', 'design');
await expect(
  'C1. [design] mover deal (UI permite arrastar hoje)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', d2), { stage: 'qualificacao', updatedAt: new Date() }),
  'denied',
);

process.exit(0);
