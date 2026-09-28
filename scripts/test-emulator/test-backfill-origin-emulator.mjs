/**
 * test-backfill-origin-emulator.mjs — Valida `scripts/backfill/backfill-deal-origin.mjs`.
 *
 * Roda SEM o emulador de functions, de propósito: é a única forma de simular o
 * acervo real, onde existem deals parados desde antes da Fase 1.3 e que nenhum
 * trigger vai tocar. Com a CF no ar, a própria criação do deal de teste
 * preencheria `origin` e o teste não provaria nada.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only firestore --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-backfill-origin-emulator.mjs"
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

const BASE = {
  name: 'Deal', company: 'Empresa', value: 0, stage: 'prospeccao',
  productId: 'wizmart', owner: 'bdr-1', status: 'open', due: '—',
  tasks: { e: false, w: false, m: false },
};

// O acervo que existe hoje: deals sem `origin`, de várias procedências.
const acervo = {
  'lp-antigo':        { funnelType: 'main', leadOrigin: { leadId: 'l1', sourceId: 'lp', sourceName: 'LP' } },
  'legado-inbound':   { funnelType: 'inbound', funnelId: 'inbound-wizmart' },
  'legado-outbound':  { funnelType: 'outbound', funnelId: 'outbound-wizmart' },
  'bdr-manual':       { funnelType: 'main', funnelId: 'wizmart' },
  'sem-funil-nenhum': {},
  'origem-forjada':   { funnelType: 'main', origin: 'inbound' }, // mentira gravada por caminho antigo
};
const esperado = {
  'lp-antigo': 'inbound',
  'legado-inbound': 'inbound',
  'legado-outbound': 'outbound',
  'bdr-manual': 'outbound',
  'sem-funil-nenhum': 'outbound',
  'origem-forjada': 'outbound',
};

for (const [id, fields] of Object.entries(acervo)) {
  await db.doc(`tenants/${TENANT}/deals/${id}`).set({
    ...BASE, ...fields, createdAt: new Date(), updatedAt: new Date(),
  });
}

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

const run = (...args) => execFileSync('node', ['scripts/backfill/backfill-deal-origin.mjs', ...args], {
  encoding: 'utf8', env: { ...process.env, TENANT_ID: TENANT, GCLOUD_PROJECT: PROJECT },
});

// ── Dry-run não escreve nada ──────────────────────────────────────────────────
const saidaDry = run('--emulator');
const semOriginDepoisDoDry = (await db.collection(`tenants/${TENANT}/deals`).get())
  .docs.filter(d => d.data().origin === undefined).length;
report(semOriginDepoisDoDry === 5 && saidaDry.includes('dry-run'),
  'dry-run não grava nada',
  `${semOriginDepoisDoDry} deals ainda sem origin`);

// Guarda o updatedAt de antes, para comparar depois de gravar.
const updatedAtAntes = (await db.doc(`tenants/${TENANT}/deals/bdr-manual`).get())
  .data().updatedAt.toMillis();

// ── Aplicando ─────────────────────────────────────────────────────────────────
run('--apply', '--emulator');

for (const [id, esp] of Object.entries(esperado)) {
  const d = (await db.doc(`tenants/${TENANT}/deals/${id}`).get()).data();
  report(d?.origin === esp, `${id} → ${esp}`, `origin=${d?.origin}`);
}

// ── updatedAt intacto ─────────────────────────────────────────────────────────
// O backfill não pode parecer atividade no card: `updatedAt` alimenta o
// vencimento por inatividade (21 dias) e a ordenação por recência da cadência.
const updatedAtDepois = (await db.doc(`tenants/${TENANT}/deals/bdr-manual`).get())
  .data().updatedAt.toMillis();
report(updatedAtAntes === updatedAtDepois,
  'backfill não mexe em updatedAt (não simula atividade no card)',
  `${updatedAtAntes} → ${updatedAtDepois}`);

// ── Idempotência ──────────────────────────────────────────────────────────────
const saida2 = run('--apply', '--emulator');
report(saida2.includes('a gravar: 0'), 'rodar de novo não grava nada (idempotente)');

console.log(allOk ? '\n🎉 Backfill validado no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
