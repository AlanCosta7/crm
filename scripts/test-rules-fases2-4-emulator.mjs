/**
 * test-rules-fases2-4-emulator.mjs — QA das superfícies de rules tocadas
 * pelas Fases 2–4 dos ajustes do cliente (jul/2026):
 *
 *   A. BDR cria deal com status 'in_queue' (fila do SDR) → permitido
 *   B. Standby: SDR cria as 5 activities próprias → permitido
 *   C. SDR conclui a PRÓPRIA activity → permitido; a de OUTRO usuário → negado
 *   D. settings/cadence: manager escreve → permitido; SDR escreve → negado; SDR lê → permitido
 *      (24/08/2026: leitura liberada pro SDR — a sequência de contato configurada
 *      aqui precisa aparecer como orientação na tela dele, ver PLANO_SEQUENCIA_CADENCIA.md)
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json --only auth,firestore \
 *        --project demo-wizmart "node scripts/test-rules-fases2-4-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, setDoc, getDoc, collection, addDoc,
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

let failures = 0;
async function expect(label, promise, expected /* 'ok' | 'denied' */) {
  try {
    await promise;
    const pass = expected === 'ok';
    if (!pass) failures++;
    console.log(`${pass ? '✅' : '🔴'} ${label} → PERMITIDO ${pass ? '' : '(DEVERIA SER NEGADO)'}`);
  } catch (e) {
    const denied = e.code === 'permission-denied';
    const pass = expected === 'denied' && denied;
    if (!pass) failures++;
    console.log(`${pass ? '✅' : '🔴'} ${label} → ${denied ? 'NEGADO' : `ERRO ${e.code}`} ${pass ? '' : `(esperado: ${expected})`}`);
  }
}

// ── A. BDR cria deal na fila do SDR ───────────────────────────────────────────
await loginAs('bdr-1', 'bdr');
await expect('A1. [bdr] criar deal status in_queue (fila do SDR)',
  addDoc(collection(db, 'tenants', TENANT, 'deals'), {
    name: 'Lead BDR', company: 'X', value: 0, stage: 'prospeccao',
    funnelId: 'f1', funnelType: 'main', productId: 'wizmart',
    owner: 'bdr-1', bdrId: 'bdr-1', due: '—', status: 'in_queue',
    tasks: { e: false, w: false, m: false }, createdAt: new Date(), updatedAt: new Date(),
  }), 'ok');

// ── B/C. Standby e conclusão de activities ────────────────────────────────────
const dealRef = await adb.collection(`tenants/${TENANT}/deals`).add({
  name: 'Deal Standby', company: 'X', value: 0, stage: 'qualificacao',
  funnelId: 'f1', productId: 'wizmart', owner: 'sdr-1', assignedSdrId: 'sdr-1',
  status: 'open', due: '—', tasks: { e: false, w: false, m: false },
  createdAt: new Date(), updatedAt: new Date(),
});

await loginAs('sdr-1', 'sdr');
let standbyActId = null;
for (let i = 1; i <= 5; i++) {
  const p = addDoc(collection(db, 'tenants', TENANT, 'activities'), {
    type: 'call', dealId: dealRef.id, userId: 'sdr-1', cadenceType: 'standby',
    standbyIndex: i, standbyTotal: 5, status: 'pending',
    scheduledAt: new Date(Date.now() + i * 7 * 86400000), dueAt: new Date(Date.now() + i * 7 * 86400000),
    coinsAwarded: 0, wasOnTime: false, overdueNotificationCount: 0,
    contactName: 'X', companyName: 'X', productId: 'wizmart',
  });
  if (i === 1) {
    try { standbyActId = (await p).id; console.log('✅ B1. [sdr] criar follow-up de standby próprio → PERMITIDO'); }
    catch (e) { failures++; console.log(`🔴 B1. [sdr] criar follow-up standby → ${e.code}`); }
  } else {
    await p.catch(() => failures++);
  }
}
await expect('B2. [sdr] marcar deal standbyActive',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', dealRef.id), {
    standbyActive: true, standbyStartedAt: new Date(), standbyFollowUps: 5, updatedAt: new Date(),
  }), 'ok');

await expect('C1. [sdr] concluir a PRÓPRIA activity',
  updateDoc(doc(db, 'tenants', TENANT, 'activities', standbyActId), {
    status: 'completed', completedAt: new Date(), updatedAt: new Date(),
  }), 'ok');

// activity de outro usuário (criada via admin)
const otherAct = await adb.collection(`tenants/${TENANT}/activities`).add({
  type: 'call', dealId: dealRef.id, userId: 'sdr-2', cadenceType: 'sdr_daily',
  status: 'pending', productId: 'wizmart', createdAt: new Date(),
});
await expect('C2. [sdr] concluir activity de OUTRO usuário',
  updateDoc(doc(db, 'tenants', TENANT, 'activities', otherAct.id), {
    status: 'completed', completedAt: new Date(),
  }), 'denied');

// ── D. settings/cadence ───────────────────────────────────────────────────────
await loginAs('manager-1', 'manager');
await expect('D1. [manager] escrever settings/cadence',
  setDoc(doc(db, 'tenants', TENANT, 'settings', 'cadence'), {
    sdr: { newCardsPerDay: 4, weeklyContacts: [3, 2, 1] },
    rep: { firstContactBusinessDays: 2 },
    updatedAt: new Date(), updatedBy: 'manager-1',
  }, { merge: true }), 'ok');
await expect('D2. [manager] ler settings/cadence',
  getDoc(doc(db, 'tenants', TENANT, 'settings', 'cadence')), 'ok');

await loginAs('sdr-1', 'sdr');
await expect('D3. [sdr] escrever settings/cadence',
  setDoc(doc(db, 'tenants', TENANT, 'settings', 'cadence'), { sdr: { newCardsPerDay: 99 } }, { merge: true }), 'denied');
await expect('D4. [sdr] ler settings/cadence (precisa ver a sequência configurada)',
  getDoc(doc(db, 'tenants', TENANT, 'settings', 'cadence')), 'ok');

// master continua com acesso ao restante de settings
await loginAs('master-1', 'master');
await expect('D5. [master] escrever settings/cadence',
  setDoc(doc(db, 'tenants', TENANT, 'settings', 'cadence'), { rep: { firstContactBusinessDays: 3 } }, { merge: true }), 'ok');

// ── E. Motivo de perda estruturado + devolução ao BDR ─────────────────────────
const lostDealRef = await adb.collection(`tenants/${TENANT}/deals`).add({
  name: 'Deal Perda', company: 'X', value: 0, stage: 'qualificacao',
  funnelId: 'f1', productId: 'wizmart', owner: 'sdr-1', bdrId: 'bdr-1', assignedSdrId: 'sdr-1',
  status: 'open', due: '—', tasks: { e: false, w: false, m: false },
  createdAt: new Date(), updatedAt: new Date(),
});

await loginAs('sdr-1', 'sdr');
await expect('E1. [sdr] marcar perda com motivo simples (sem devolução ao BDR)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', lostDealRef.id), {
    status: 'lost', lostReason: 'valor_alto', updatedAt: new Date(),
  }), 'ok');
await expect('E2. [sdr] registrar nota da perda (activity própria)',
  addDoc(collection(db, 'tenants', TENANT, 'activities'), {
    type: 'note', dealId: lostDealRef.id, userId: 'sdr-1',
    text: 'Negócio perdido — Achou nosso valor alto', status: 'completed',
    cadenceType: 'manual', coinsAwarded: 0, wasOnTime: true, productId: 'wizmart',
  }), 'ok');

const requeueDealRef = await adb.collection(`tenants/${TENANT}/deals`).add({
  name: 'Deal Concorrente', company: 'X', value: 0, stage: 'qualificacao',
  funnelId: 'f1', productId: 'wizmart', owner: 'sdr-1', bdrId: 'bdr-1', assignedSdrId: 'sdr-1',
  status: 'open', due: '—', tasks: { e: false, w: false, m: false },
  createdAt: new Date(), updatedAt: new Date(),
});
await expect('E3. [sdr] marcar perda com devolução ao BDR (fechou_concorrente)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', requeueDealRef.id), {
    status: 'lost', lostReason: 'fechou_concorrente',
    assignedSdrId: null, requeuedForBdr: true, requeuedAt: new Date(),
    updatedAt: new Date(),
  }), 'ok');

await loginAs('bdr-1', 'bdr');
await expect('E4. [bdr] reativar lead devolvido (status volta a in_queue)',
  updateDoc(doc(db, 'tenants', TENANT, 'deals', requeueDealRef.id), {
    status: 'in_queue', requeuedForBdr: false, updatedAt: new Date(),
  }), 'ok');

console.log(failures === 0 ? '\n🎉 Todas as verificações de rules passaram' : `\n💥 ${failures} verificação(ões) falharam`);
process.exit(failures === 0 ? 0 : 1);
