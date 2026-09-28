/**
 * test-deal-origin-cf-emulator.mjs — Valida a Fase 1.3 do PLANO_DESENHO_CRM.md:
 * `Deal.origin` derivado no servidor, protegido contra reescrita pela UI, e o
 * backfill dos deals antigos.
 *
 * Cenários:
 *  1. Deal criado com `leadOrigin` (Landing Page) → origin='inbound'.
 *  2. Deal criado à mão pelo BDR → origin='outbound'.
 *  3. Deal em funil legado 'inbound' → origin='inbound'.
 *  4. Deal criado com origin FORJADO no payload → servidor sobrescreve.
 *  5. Cliente tentando REESCREVER origin em update → negado pelas rules.
 *  6. Apagar `origin` à mão é reposto pelo servidor (autocorreção).
 *
 * O backfill dos deals antigos NÃO é testado aqui: com o trigger no ar é
 * impossível simular um deal intocado (a própria criação do deal de teste
 * dispara a CF, que preenche o campo). Esse caso tem script próprio, rodado
 * sem o emulador de functions — `scripts/test-emulator/test-backfill-origin-emulator.mjs`.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-deal-origin-cf-emulator.mjs"
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, updateDoc, setDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();

const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' });
const cdb = getFirestore(app);
connectFirestoreEmulator(cdb, '127.0.0.1', 8081);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });

// Perfil do usuário no Firestore: desde a Fase 0 do PLANO_DESENHO_CRM.md,
// `isTenant()` nas rules consulta `users/{uid}.isActive` — sem perfil, toda
// escrita do cliente é negada.
await adb.doc(`tenants/${TENANT}/users/bdr-1`).set({
  uid: 'bdr-1', name: 'BDR Teste', email: 'bdr-1@wizmart.com.br',
  role: 'bdr', productIds: ['wizmart', 'smart_cafe'], isActive: true,
});

const token = await admin.auth().createCustomToken('bdr-1', {
  tenantId: TENANT, role: 'bdr', productIds: ['wizmart', 'smart_cafe'],
});
await signInWithCustomToken(auth, token);

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

const BASE = {
  name: 'Deal Origem', company: 'Empresa X', value: 0, stage: 'prospeccao',
  productId: 'wizmart', owner: 'bdr-1', bdrId: 'bdr-1', status: 'open', due: '—',
  tasks: { e: false, w: false, m: false },
};

/** Cria via Admin SDK (simula CF/backend) e espera o trigger convergir. */
async function criarViaAdmin(fields) {
  const ref = await adb.collection(`tenants/${TENANT}/deals`).add({
    ...BASE, ...fields, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref;
}

async function esperarOrigin(ref, esperado, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = (await ref.get()).data();
    if (d?.origin === esperado) return d;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

// ── 1. Lead de Landing Page ───────────────────────────────────────────────────
const d1 = await criarViaAdmin({
  funnelId: 'wizmart', funnelType: 'main',
  leadOrigin: { leadId: 'l1', sourceId: 'lp-wizmart', sourceName: 'Landing Page' },
});
report(!!(await esperarOrigin(d1, 'inbound')),
  'deal com leadOrigin (Landing Page) → inbound');

// ── 2. Card criado à mão ──────────────────────────────────────────────────────
const d2 = await criarViaAdmin({ funnelId: 'wizmart', funnelType: 'main' });
report(!!(await esperarOrigin(d2, 'outbound')),
  'deal criado à mão pelo BDR → outbound');

// ── 3. Funil legado inbound ───────────────────────────────────────────────────
const d3 = await criarViaAdmin({ funnelId: 'inbound-wizmart', funnelType: 'inbound' });
report(!!(await esperarOrigin(d3, 'inbound')),
  'deal em funil legado inbound → inbound (sem precisar migrar o funil)');

// ── 4. Origem forjada no payload ──────────────────────────────────────────────
// Um deal criado à mão dizendo ser inbound tem que ser corrigido pelo servidor.
const d4 = await criarViaAdmin({ funnelId: 'wizmart', funnelType: 'main', origin: 'inbound' });
report(!!(await esperarOrigin(d4, 'outbound')),
  'origem FORJADA no payload é sobrescrita pelo servidor',
  `origin=${(await d4.get()).data()?.origin}`);

// ── 5. Cliente tentando reescrever a origem ───────────────────────────────────
await esperarOrigin(d2, 'outbound');
let negado = false;
try {
  await updateDoc(doc(cdb, 'tenants', TENANT, 'deals', d2.id), { origin: 'inbound' });
} catch (e) {
  negado = e.code === 'permission-denied';
}
report(negado, 'cliente NÃO consegue reescrever origin (rules)',
  negado ? 'permission-denied' : 'a escrita passou');

// O mesmo cliente continua editando os campos normais do card.
let edicaoNormalOk = true;
try {
  await updateDoc(doc(cdb, 'tenants', TENANT, 'deals', d2.id), { value: 1500, updatedAt: new Date() });
} catch {
  edicaoNormalOk = false;
}
report(edicaoNormalOk, 'cliente continua editando os campos normais do card');

// ── 6. Apagar a origem à mão é reposto pelo servidor ──────────────────────────
// Consequência direta de a CF derivar sempre dos sinais confiáveis: o campo é
// autocorretivo, não só protegido pelas rules.
await esperarOrigin(d3, 'inbound');
await d3.update({ origin: admin.firestore.FieldValue.delete() });
report(!!(await esperarOrigin(d3, 'inbound')),
  'apagar origin à mão é reposto pelo servidor (autocorreção)');

console.log(allOk ? '\n🎉 Fase 1.3 validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
