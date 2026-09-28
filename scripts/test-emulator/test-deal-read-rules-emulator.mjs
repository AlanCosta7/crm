/**
 * test-deal-read-rules-emulator.mjs — valida a leitura/edição restrita a
 * participantes (Fase B do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md) e prova um
 * achado crítico: o Firestore REJEITA POR INTEIRO uma query sem `where` que
 * combine com a regra (não filtra silenciosamente os docs que a rule barra).
 * Isso significa que qualquer tela que hoje faz
 * `useFirestoreCollection<Deal>('deals')` sem filtro vai quebrar por completo
 * para BDR/SDR/Rep no instante em que esta rule subir — não é degradação
 * suave, é permission-denied na tela inteira.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore --project demo-wizmart \
 *        "node scripts/test-emulator/test-deal-read-rules-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, query, where, addDoc,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken, signOut } from 'firebase/auth';
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

async function loginAs(uid, role) {
  await signOut(auth).catch(() => {});
  const token = await admin.auth().createCustomToken(uid, { tenantId: TENANT, role, productIds: ['wizmart', 'smart_cafe'] });
  await signInWithCustomToken(auth, token);
}

async function expect(label, promise, expected /* 'ok' | 'denied' */) {
  try {
    await promise;
    const pass = expected === 'ok';
    console.log(`${pass ? '✅' : '🔴'} ${label} → PERMITIDO ${pass ? '(esperado)' : '(DEVERIA SER NEGADO)'}`);
    return pass;
  } catch (e) {
    const denied = e.code === 'permission-denied';
    const pass = expected === 'denied' && denied;
    console.log(`${pass ? '✅' : '🔴'} ${label} → ${denied ? 'NEGADO' : e.code} ${pass ? '(esperado)' : '(inesperado)'}`);
    return pass;
  }
}

let allOk = true;
const run = async (...args) => { if (!(await expect(...args))) allOk = false; };

// d1: bdr-1 + sdr-1 assinam; rep-1 NUNCA participou.
const d1Ref = await adb.collection(`tenants/${TENANT}/deals`).add({
  name: 'Deal Rules', company: 'X', value: 0, stage: 'qualificacao',
  funnelId: 'f1', funnelType: 'farmer', productId: 'wizmart',
  owner: 'bdr-1', bdrId: 'bdr-1', assignedSdrId: 'sdr-1',
  participantIds: ['bdr-1', 'sdr-1'], responsibleId: 'sdr-1',
  due: '—', status: 'open', tasks: { e: false, w: false, m: false },
  createdAt: new Date(), updatedAt: new Date(),
});

console.log('\n── Leitura de doc único (get) ──────────────────────────────');
await loginAs('bdr-1', 'bdr');
await run('[bdr-1] lê deal que assinou', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'ok');

await loginAs('sdr-1', 'sdr');
await run('[sdr-1] lê deal que assinou', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'ok');

await loginAs('rep-1', 'rep');
await run('[rep-1] lê deal que NUNCA participou', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'denied');

await loginAs('manager-1', 'manager');
await run('[manager-1] lê qualquer deal', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'ok');

await loginAs('viewer-1', 'viewer');
await run('[viewer-1] lê qualquer deal (tratado como manager)', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'ok');

await loginAs('design-1', 'design');
await run('[design-1] lê qualquer deal (tratado como manager)', getDoc(doc(db, 'tenants', TENANT, 'deals', d1Ref.id)), 'ok');

console.log('\n── Achado crítico: query SEM filtro (o que as telas fazem hoje) ──');
await loginAs('sdr-1', 'sdr');
await run(
  '[sdr-1] lista TODA a coleção deals sem where (padrão atual das telas)',
  getDocs(collection(db, 'tenants', TENANT, 'deals')),
  'denied', // a query inteira é rejeitada — Firestore não "filtra e devolve o que pode"
);

console.log('\n── A mesma tela funciona se adicionar o where obrigatório ─────');
await run(
  '[sdr-1] lista deals COM where(participantIds array-contains uid)',
  getDocs(query(collection(db, 'tenants', TENANT, 'deals'), where('participantIds', 'array-contains', 'sdr-1'))),
  'ok',
);

await loginAs('manager-1', 'manager');
await run('[manager-1] lista TODA a coleção sem where (bypass por papel)', getDocs(collection(db, 'tenants', TENANT, 'deals')), 'ok');

console.log('\n── Criação: todo operacional pode criar — só edição é restrita ─');
// Confirmado com o Alan (22/08): "todos os usuários podem criar um card. As
// restrições estão na edição de cards criados." Fix: allow create passou de
// isBdr(tid) (só master/manager/bdr) para isOperational(tid).
const newDeal = (extra) => ({
  name: 'Novo Card', company: 'Y', value: 0, stage: 'qualificacao',
  funnelId: 'f1', funnelType: 'farmer', productId: 'wizmart',
  due: '—', status: 'open', tasks: { e: false, w: false, m: false },
  createdAt: new Date(), updatedAt: new Date(), ...extra,
});

await loginAs('sdr-2', 'sdr');
await run('[sdr-2] cria card direto (bug reportado — antes negado)', addDoc(collection(db, 'tenants', TENANT, 'deals'), newDeal({ owner: 'sdr-2', assignedSdrId: 'sdr-2' })), 'ok');

await loginAs('rep-2', 'rep');
await run('[rep-2] cria card direto', addDoc(collection(db, 'tenants', TENANT, 'deals'), newDeal({ owner: 'rep-2' })), 'ok');

await loginAs('viewer-2', 'viewer');
await run('[viewer-2] tenta criar card (não é operacional)', addDoc(collection(db, 'tenants', TENANT, 'deals'), newDeal({ owner: 'viewer-2' })), 'denied');

await loginAs('design-2', 'design');
await run('[design-2] tenta criar card (não é operacional)', addDoc(collection(db, 'tenants', TENANT, 'deals'), newDeal({ owner: 'design-2' })), 'denied');

console.log(allOk
  ? '\n🎉 TODOS os cenários de leitura/edição por participação validados'
  : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
