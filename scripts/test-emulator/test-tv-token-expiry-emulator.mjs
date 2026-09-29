/**
 * test-tv-token-expiry-emulator.mjs — validade do link da TV no EMULADOR
 * (PLANO_DESENHO_CRM_2.md, B6).
 *
 * A regra do RTDB é quem recusa a leitura de um link vencido — o cliente da TV
 * é anônimo, então o teste lê via REST sem token de auth nenhum, igual ao
 * navegador da TV faz de verdade (o Admin SDK ignora as rules, não serve aqui).
 *
 * Cenários:
 *  1. Link com expiresAtMs no passado → leitura negada (PERMISSION_DENIED).
 *  2. Link com expiresAtMs no futuro → leitura liberada.
 *  3. Link sem expiresAtMs (gerado antes do B6, ou "nunca expira") → leitura
 *     liberada — não dá pra aplicar retroativamente uma validade nunca gravada.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json --only database \
 *        --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-tv-token-expiry-emulator.mjs"
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9001';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const NS = `${PROJECT}-default-rtdb`;
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;

admin.initializeApp({ projectId: PROJECT, databaseURL: `http://${HOST}?ns=${NS}` });
const rtdb = admin.database();

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

// Leitura pública, sem auth nenhum — o mesmo caminho do navegador da TV.
async function readAsPublic(token) {
  const res = await fetch(`http://${HOST}/public_tv/${token}.json?ns=${NS}`);
  const body = await res.json();
  return { status: res.status, body };
}

const baseSnapshot = (token) => ({
  tenantId: 'wizmart', tenantName: 'TV Teste', allowedMetrics: ['meta_pct'], productId: 'wizmart',
});

// 1. Vencido — leitura negada.
await rtdb.ref('public_tv/tv_vencido').set({ ...baseSnapshot(), expiresAtMs: Date.now() - 60_000 });
{
  const { status, body } = await readAsPublic('tv_vencido');
  report(status !== 200 && !!body?.error, '1. link vencido: leitura negada', `status=${status}`);
}

// 2. Válido — leitura liberada.
await rtdb.ref('public_tv/tv_valido').set({ ...baseSnapshot(), expiresAtMs: Date.now() + 60_000 });
{
  const { status, body } = await readAsPublic('tv_valido');
  report(status === 200 && body?.tenantId === 'wizmart', '2. link válido: leitura liberada', `status=${status}`);
}

// 3. Sem expiresAtMs (link antigo / "nunca expira") — leitura liberada.
await rtdb.ref('public_tv/tv_sem_validade').set({ ...baseSnapshot() });
{
  const { status, body } = await readAsPublic('tv_sem_validade');
  report(status === 200 && body?.tenantId === 'wizmart', '3. link sem expiresAtMs: leitura liberada (compatibilidade)', `status=${status}`);
}

console.log(allOk ? '\n🎉 Validade do link da TV validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
