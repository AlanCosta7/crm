/**
 * test-user-claims-cf-emulator.mjs — Valida a Fase 0 do PLANO_DESENHO_CRM.md:
 * a CF `onUserProfileWritten` mantém as custom claims do token fiéis ao
 * documento do usuário, espelha o bloqueio de acesso no Firebase Auth e não
 * revoga sessão à toa.
 *
 * Cenários:
 *  1. Promover SDR → manager regrava a claim `role` e revoga os tokens.
 *  2. Trocar produtos regrava a claim `productIds`.
 *  3. `isActive: false` desabilita a conta no Auth (documento preservado).
 *  4. `isActive: true` de volta reabilita.
 *  5. Papel inválido cai em `viewer`, nunca em `master`.
 *  6. Escrita irrelevante (coinBalance) NÃO revoga a sessão — o short-circuit.
 *  7. Rebaixar o último master ativo é bloqueado e o documento é restaurado.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-user-claims-cf-emulator.mjs"
 */
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

const userRef = (uid) => adb.doc(`tenants/${TENANT}/users/${uid}`);

/** Triggers do emulador têm latência variável — espera pela condição. */
async function waitForUser(uid, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rec = await aauth.getUser(uid);
    if (predicate(rec)) return rec;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function waitForDoc(uid, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await userRef(uid).get();
    if (predicate(snap.data())) return snap.data();
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function criarUsuario(uid, { role, productIds = ['wizmart'], isActive = true }) {
  try { await aauth.deleteUser(uid); } catch { /* não existia */ }
  await aauth.createUser({ uid, email: `${uid}@wizmart.com.br`, password: 'senha_de_teste_123' });
  await aauth.setCustomUserClaims(uid, { tenantId: TENANT, role, productIds });
  await userRef(uid).set({
    uid, name: uid, email: `${uid}@wizmart.com.br`,
    role, productIds, isActive, points: 0, coinBalance: 0,
  });
  // A criação do documento já dispara a CF; deixa ela convergir antes do teste.
  await new Promise(r => setTimeout(r, 1500));
  return aauth.getUser(uid);
}

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

// ── 1. Promoção regrava a claim de papel ──────────────────────────────────────
await criarUsuario('sdr-claims', { role: 'sdr' });
await userRef('sdr-claims').update({ role: 'manager' });
let rec = await waitForUser('sdr-claims', r => r.customClaims?.role === 'manager');
report(!!rec, 'promover sdr → manager regrava a claim role',
  rec ? `claims.role=${rec.customClaims.role}` : 'claim NÃO mudou');

// ── 2. Troca de produtos regrava a claim de produtos ──────────────────────────
await userRef('sdr-claims').update({ productIds: ['wizmart', 'smart_cafe'] });
rec = await waitForUser('sdr-claims', r => (r.customClaims?.productIds || []).length === 2);
report(!!rec, 'trocar produtos regrava a claim productIds',
  rec ? `[${rec.customClaims.productIds.join(',')}]` : 'claim NÃO mudou');

// ── 3. Bloqueio desabilita a conta no Auth ────────────────────────────────────
await userRef('sdr-claims').update({ isActive: false });
rec = await waitForUser('sdr-claims', r => r.disabled === true);
report(!!rec, 'isActive:false desabilita a conta no Firebase Auth',
  rec ? 'disabled=true' : 'conta segue HABILITADA');

const docPreservado = (await userRef('sdr-claims').get()).data();
report(!!docPreservado?.email && !!docPreservado?.name,
  'documento e histórico preservados após o bloqueio',
  `name=${docPreservado?.name}`);

// ── 4. Desbloqueio reabilita ──────────────────────────────────────────────────
await userRef('sdr-claims').update({ isActive: true });
rec = await waitForUser('sdr-claims', r => r.disabled === false);
report(!!rec, 'isActive:true reabilita a conta', rec ? 'disabled=false' : 'conta segue BLOQUEADA');

// ── 5. Papel inválido cai em viewer, nunca em master ──────────────────────────
await criarUsuario('rep-invalido', { role: 'rep' });
await userRef('rep-invalido').update({ role: 'superadmin' });
rec = await waitForUser('rep-invalido', r => r.customClaims?.role === 'viewer');
report(!!rec, 'papel inválido cai em viewer (não em master)',
  rec ? `claims.role=${rec.customClaims.role}` : 'não caiu em viewer');

// ── 6. Escrita irrelevante NÃO revoga a sessão ────────────────────────────────
// É o short-circuit: users/{uid} é reescrito a cada moeda ganha, e revogar ali
// derrubaria o login do time inteiro várias vezes por dia.
await criarUsuario('sdr-moedas', { role: 'sdr' });
const antes = await aauth.getUser('sdr-moedas');
await userRef('sdr-moedas').update({ coinBalance: 500, points: 120 });
await new Promise(r => setTimeout(r, 4000));
const depois = await aauth.getUser('sdr-moedas');
report(
  antes.tokensValidAfterTime === depois.tokensValidAfterTime,
  'ganhar moedas NÃO revoga a sessão (short-circuit de idempotência)',
  `tokensValidAfterTime ${antes.tokensValidAfterTime === depois.tokensValidAfterTime ? 'intacto' : 'MUDOU'}`,
);

// ── 7. Guarda do último master ────────────────────────────────────────────────
await criarUsuario('master-unico', { role: 'master', productIds: ['wizmart', 'smart_cafe'] });
await userRef('master-unico').update({ role: 'sdr' });
const restaurado = await waitForDoc('master-unico', d => d?.role === 'master');
report(!!restaurado, 'rebaixar o último master ativo é bloqueado e o documento restaurado',
  restaurado ? 'role=master de volta' : 'o tenant ficou SEM master');

const recMaster = await aauth.getUser('master-unico');
report(recMaster.customClaims?.role === 'master',
  'claims do último master permanecem intactas',
  `claims.role=${recMaster.customClaims?.role}`);

// Com um segundo master ativo, o rebaixamento passa a ser permitido.
await criarUsuario('master-dois', { role: 'master' });
await userRef('master-unico').update({ role: 'sdr' });
rec = await waitForUser('master-unico', r => r.customClaims?.role === 'sdr');
report(!!rec, 'com outro master ativo, o rebaixamento é permitido',
  rec ? `claims.role=${rec.customClaims.role}` : 'continuou bloqueado');

console.log(allOk ? '\n🎉 Fase 0 validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
