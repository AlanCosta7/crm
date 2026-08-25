/**
 * Teste integrado do endpoint de captação de leads (WizMart Forms).
 *
 * Roda DENTRO do emulador:
 *   npm run test:leads
 *   (= firebase emulators:exec --project demo-wizmart-crm-local "node scripts/test-leads-endpoint.mjs")
 *
 * Cenários:
 *   1. POST válido            → 201, lead 'converted' + deal no 1º estágio + activity + notificação
 *   2. POST duplicado (24h)   → 201, lead 'duplicate', SEM deal novo
 *   3. Honeypot preenchido    → 201 falso, NENHUM lead gravado
 *   4. Chave inválida         → 401
 *   5. Origin não permitida   → 403
 *   6. Fonte desativada       → 401
 *   7. Payload inválido       → 400
 *   8. Flood (rate limit IP)  → 429
 */

import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart_test';
const REGION = 'southamerica-east1';
const FN_URL = `http://127.0.0.1:5001/${PROJECT}/${REGION}/captureLead`;

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

// ── Setup: funil + fonte ──────────────────────────────────────────────────────

const API_KEY = 'wzk_' + randomBytes(32).toString('base64url');
const API_KEY_HASH = createHash('sha256').update(API_KEY, 'utf8').digest('hex');
const ORIGIN = 'https://lp.wizmart-teste.com.br';

async function setup() {
  const base = `tenants/${TENANT}`;
  await db.doc(`${base}/funnels/inbound-teste`).set({
    name: 'Inbound — Teste',
    type: 'inbound',
    productId: 'wizmart',
    isActive: true,
    color: '#1A6B1A',
    stages: [
      { id: 'qualif', name: 'Qualificação', order: 2 },
      { id: 'lead_recebido', name: 'Lead Recebido', order: 1 },
    ],
  });
  await db.doc(`${base}/lead_sources/src-teste`).set({
    name: 'LP de Teste',
    apiKeyHash: API_KEY_HASH,
    apiKeyPrefix: `${API_KEY.slice(0, 12)}…`,
    allowedOrigins: ['https://*.wizmart-teste.com.br'],
    funnelId: 'inbound-teste',
    productId: 'wizmart',
    defaultOwner: 'owner-001',
    turnstileEnabled: false,
    isActive: true,
    createdAt: admin.firestore.Timestamp.now(),
  });
  await db.doc(`${base}/lead_sources/src-inativa`).set({
    name: 'Fonte Desativada',
    apiKeyHash: createHash('sha256').update('wzk_inativa', 'utf8').digest('hex'),
    apiKeyPrefix: 'wzk_inativa…',
    allowedOrigins: [ORIGIN],
    funnelId: 'inbound-teste',
    productId: 'wizmart',
    turnstileEnabled: false,
    isActive: false,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let failures = 0;

function check(label, cond, extra = '') {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    failures++;
    console.error(`  ❌ ${label} ${extra}`);
  }
}

function post(body, { key = API_KEY, origin = ORIGIN, ip = '10.0.0.1' } = {}) {
  return fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WizMart-Key': key,
      'Origin': origin,
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify(body),
  });
}

const validLead = (over = {}) => ({
  name: 'Maria Silva',
  email: 'maria@empresa.com.br',
  phone: '(11) 98765-4321',
  company: 'Mercado Bom Preço',
  message: 'Quero saber mais sobre o WizMart',
  _ts: Date.now() - 10_000,
  _hp: '',
  tracking: { utmSource: 'google', utmCampaign: 'lancamento', pageUrl: `${ORIGIN}/lp` },
  ...over,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const col = (name) => db.collection(`tenants/${TENANT}/${name}`);

/** Espera uma condição assíncrona virar true (triggers do emulador têm latência variável). */
async function waitFor(fn, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(500);
  }
  return false;
}

// ── Cenários ──────────────────────────────────────────────────────────────────

async function run() {
  await setup();
  console.log(`\n▶ Endpoint: ${FN_URL}\n`);

  // 1. POST válido
  console.log('1) POST válido');
  const r1 = await post(validLead());
  const b1 = await r1.json();
  check('status 201', r1.status === 201, `(got ${r1.status})`);
  check('responde leadId', !!b1.leadId);
  check('CORS ecoa a origin', r1.headers.get('access-control-allow-origin') === ORIGIN);

  const leadSnap = await col('leads').doc(b1.leadId).get();
  check('lead gravado como converted', leadSnap.data()?.status === 'converted');
  check('lead com dedupeKey', !!leadSnap.data()?.dedupeKey);
  check('telefone normalizado', leadSnap.data()?.data?.phone === '11987654321');

  const dealId = leadSnap.data()?.dealId;
  const dealSnap = dealId ? await col('deals').doc(dealId).get() : null;
  check('deal criado', !!dealSnap?.exists);
  check('deal no 1º estágio (menor order)', dealSnap?.data()?.stage === 'lead_recebido');
  check('deal com leadOrigin.sourceName', dealSnap?.data()?.leadOrigin?.sourceName === 'LP de Teste');
  check('deal com UTM', dealSnap?.data()?.leadOrigin?.utm?.utmSource === 'google');
  check('deal owner = defaultOwner da fonte', dealSnap?.data()?.owner === 'owner-001');

  // trigger onLeadCreated (assíncrono — latência variável no emulador)
  const gotActivity = await waitFor(async () => {
    const acts = await col('activities').where('dealId', '==', dealId).get();
    return acts.docs.some((d) => d.data().who === 'WizMart Forms');
  });
  check('activity "Lead recebido" criada pelo trigger', gotActivity);
  const gotNotif = await waitFor(async () => {
    const notifs = await col('notifications').where('userId', '==', 'owner-001').get();
    return notifs.size >= 1;
  });
  check('notificação criada p/ o owner', gotNotif);

  // 2. Duplicado
  console.log('2) POST duplicado (mesmo email, <24h)');
  const r2 = await post(validLead({ _ts: Date.now() - 8000 }), { ip: '10.0.0.2' });
  const b2 = await r2.json();
  check('status 201', r2.status === 201);
  const lead2 = await col('leads').doc(b2.leadId).get();
  check('lead marcado duplicate', lead2.data()?.status === 'duplicate');
  check('aponta p/ o MESMO deal', lead2.data()?.dealId === dealId);
  const deals = await col('deals').get();
  check('nenhum deal novo', deals.size === 1, `(${deals.size} deals)`);

  // 3. Honeypot
  console.log('3) Honeypot preenchido (bot)');
  const before = (await col('leads').get()).size;
  const r3 = await post(validLead({ _hp: 'http://spam.com', email: 'bot@spam.com' }), { ip: '10.0.0.3' });
  check('sucesso FALSO 201', r3.status === 201);
  check('nenhum lead gravado', (await col('leads').get()).size === before);

  // 4. Chave inválida
  console.log('4) Chave inválida');
  const r4 = await post(validLead(), { key: 'wzk_' + 'x'.repeat(43), ip: '10.0.0.4' });
  check('status 401', r4.status === 401, `(got ${r4.status})`);

  // 5. Origin não permitida
  console.log('5) Origin não permitida');
  const r5 = await post(validLead(), { origin: 'https://site-do-mal.com', ip: '10.0.0.5' });
  check('status 403', r5.status === 403, `(got ${r5.status})`);

  // 6. Fonte desativada (kill-switch)
  console.log('6) Fonte desativada');
  const r6 = await post(validLead(), { key: 'wzk_inativa', ip: '10.0.0.6' });
  check('status 401 (indistinguível de chave inválida)', r6.status === 401, `(got ${r6.status})`);

  // 7. Payload inválido
  console.log('7) Payload inválido (sem email/telefone)');
  const r7 = await post({ name: 'Só Nome', _ts: Date.now() - 8000 }, { ip: '10.0.0.7' });
  const b7 = await r7.json();
  check('status 400 invalid_request', r7.status === 400 && b7.error === 'invalid_request', `(got ${r7.status})`);

  // 8. Rate limit por IP (5/min)
  console.log('8) Flood do mesmo IP');
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await post(validLead({ email: `flood${i}@x.com` }), { ip: '10.9.9.9' });
    if (r.status === 429) got429 = true;
  }
  check('bloqueia com 429 antes da 8ª requisição', got429);

  // contadores da fonte
  const src = await col('lead_sources').doc('src-teste').get();
  check('stats.received incrementado', (src.data()?.stats?.received ?? 0) >= 2, `(${src.data()?.stats?.received})`);
  check('stats.blocked incrementado', (src.data()?.stats?.blocked ?? 0) >= 2, `(${src.data()?.stats?.blocked})`);

  console.log(failures === 0 ? '\n🟢 TODOS OS CENÁRIOS PASSARAM' : `\n🔴 ${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
