/**
 * test-tenant-discovery-emulator.mjs — Valida a correção de um bug real
 * (achado em QA manual, 13/09/2026): `dailyCadenceEngine` (e outros 5 crons —
 * kpiAggregator, tvDataRefresher, commissionEvaluationQueue,
 * contractReminderEmail, repSlaChecker/activityOverdueChecker) descobriam
 * tenants via `db.collection("tenants").get()`, mas NENHUM lugar do código
 * jamais grava um documento em `tenants/{tenantId}` — só as subcoleções
 * existem. Resultado: os crons rodavam todo dia sem processar tenant nenhum,
 * silenciosamente.
 *
 * Cenários:
 *  1. Confirma que `tenants/{tid}` de verdade NÃO existe como documento
 *     (reproduz a causa raiz antes de provar a correção).
 *  2. Dispara `dailyCadenceEngine` via HTTP (mesmo mecanismo do botão
 *     "Trigger now" do Emulator UI) e confirma que ele agora DESCOBRE o
 *     tenant e distribui um card real pro SDR — a fila de hoje passa a
 *     existir.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-tenant-discovery-emulator.mjs"
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';
const REGION = 'southamerica-east1';
const FUNCTIONS_PORT = 5002;

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const auth = admin.auth();

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

// ── Seed mínimo: só subcoleções, NUNCA o documento tenants/{tid} ────────────
const SDR_UID = 'sdr-discovery';
await auth.createUser({ uid: SDR_UID, email: `${SDR_UID}@wizmart.com.br`, password: 'senha_de_teste_123' }).catch(() => {});
await db.doc(`tenants/${TENANT}/users/${SDR_UID}`).set({
  uid: SDR_UID, name: 'SDR Discovery', role: 'sdr', productIds: ['wizmart'], isActive: true,
});
await db.doc(`tenants/${TENANT}/deals/deal-discovery-001`).set({
  name: 'Lead Descoberta de Tenant', company: 'Empresa Teste Discovery', value: 1000,
  stage: 'lista_potencial', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart',
  status: 'in_queue', owner: 'bdr-discovery', createdAt: new Date(),
});

// ── 1. Causa raiz: tenants/{tid} não existe como documento ──────────────────
const tenantDoc = await db.doc(`tenants/${TENANT}`).get();
report(!tenantDoc.exists, '1. tenants/{tid} de verdade NÃO existe como documento (causa raiz reproduzida)');

const tenantsCollectionSnap = await db.collection('tenants').get();
report(tenantsCollectionSnap.empty, '1b. db.collection("tenants").get() confirma vazio — é exatamente o que os crons antigos liam');

// ── 2. Disparar o motor via HTTP (mesmo caminho do "Trigger now") ───────────
const before = await db.collection(`tenants/${TENANT}/cadence_queues/${SDR_UID}/daily`).listDocuments();
report(before.length === 0, '2. antes do disparo, nenhuma fila diária existe pro SDR');

// Cold start do worker da function pode levar alguns segundos e o `fetch`
// nativo do Node ocasionalmente estoura o timeout de headers nesse meio-tempo
// — tenta de novo em vez de falhar no primeiro soluço.
async function triggerEngine(tentativas = 4) {
  const url = `http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT}/${REGION}/dailyCadenceEngine-0`;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { method: 'POST', signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      if (i === tentativas) throw err;
      console.log(`   (tentativa ${i} de disparar o motor falhou — ${err.message}; tentando de novo em 3s)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const res = await triggerEngine();
report(res.ok, '2b. dailyCadenceEngine-0 disparado via HTTP', `status ${res.status}`);

// A execução é assíncrona no emulador — espera a fila de hoje aparecer.
async function waitForTodayQueue(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const docs = await db.collection(`tenants/${TENANT}/cadence_queues/${SDR_UID}/daily`).listDocuments();
    if (docs.length > 0) return docs[0];
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

const queueRef = await waitForTodayQueue();
report(!!queueRef, '3. motor agora DESCOBRE o tenant e cria a fila de hoje do SDR (era o bug — antes nunca acontecia)');

if (queueRef) {
  const queueSnap = await queueRef.get();
  const data = queueSnap.data();
  report(data.cardsDistributed >= 1, '3b. pelo menos 1 card distribuído da fila do BDR', `cardsDistributed=${data.cardsDistributed}`);
}

console.log(allOk ? '\n🎉 Descoberta de tenants corrigida — crons voltaram a processar' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
