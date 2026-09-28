/**
 * test-cohort-cf-emulator.mjs — Valida o FIX dos bugs 0.1/0.2:
 * o cliente move o deal SEM escrever cohortKeys (novo commitDrop) e a CF
 * onDealStageChanged grava os cohorts server-side, incluindo os 2 casos
 * que antes só existiam no cliente (conectado smart_cafe e prospectsSharedMonth).
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart \
 *        "node scripts/test-emulator/test-cohort-cf-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
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

const token = await admin.auth().createCustomToken('sdr-1', { tenantId: TENANT, role: 'sdr', productIds: ['wizmart', 'smart_cafe'] });
await signInWithCustomToken(auth, token);

async function makeDeal(fields) {
  const ref = await adb.collection(`tenants/${TENANT}/deals`).add({
    name: 'Deal CF', company: 'X', value: 0, stage: 'qualificacao',
    funnelId: 'f1', funnelType: 'farmer', productId: 'wizmart',
    owner: 'sdr-1', assignedSdrId: 'sdr-1', status: 'open', due: '—',
    tasks: { e: false, w: false, m: false }, createdAt: new Date(), updatedAt: new Date(),
    ...fields,
  });
  return ref;
}

// Polling: triggers do emulador têm latência variável
async function waitFor(ref, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await ref.get();
    if (predicate(snap.data())) return snap.data();
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

let allOk = true;
async function check(label, ref, stage, predicate) {
  try {
    await updateDoc(doc(db, 'tenants', TENANT, 'deals', ref.id), { stage, updatedAt: new Date() });
  } catch (e) {
    console.log(`🔴 ${label} — move NEGADO (${e.code})`);
    allOk = false;
    return;
  }
  const data = await waitFor(ref, predicate);
  const ok = data !== null;
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label} — move OK, CF ${ok ? 'gravou' : 'NÃO gravou'} cohort`);
}

const d1 = await makeDeal({});
await check('visita_agendada → visitScheduledMonth', d1, 'visita_agendada',
  d => !!d?.cohortKeys?.visitScheduledMonth);

const d2 = await makeDeal({ productId: 'smart_cafe' });
await check('conectado (smart_cafe) → visitScheduledMonth', d2, 'conectado',
  d => !!d?.cohortKeys?.visitScheduledMonth);

const d3 = await makeDeal({ bdrId: 'bdr-1' });
await check('prospeccao (bdr+sdr) → prospectsSharedMonth', d3, 'prospeccao',
  d => !!d?.cohortKeys?.prospectsSharedMonth);

const d4 = await makeDeal({});
await check('inaugurado → conquestMonth + status won', d4, 'inaugurado',
  d => !!d?.cohortKeys?.conquestMonth && d?.status === 'won');

console.log(allOk ? '\n🎉 TODOS os cenários do fix validados' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
