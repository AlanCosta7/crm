/**
 * test-gamification-settings-emulator.mjs — pontuação configurável, ponta a
 * ponta, no EMULADOR com as Cloud Functions reais (PLANO_DESENHO_CRM_2.md).
 *
 * Cenários:
 *  1. Sem tenants/{tid}/settings/gamification, os valores continuam os
 *     mesmos que já eram fixos no código (dealWon = 100 pts).
 *  2. Com o documento configurado, onTaskComplete usa o valor CUSTOM (não o
 *     15/20/30 fixo de antes).
 *  3. pointsOnEnter de uma etapa do funil (irmão de coinsOnEnter) credita pts
 *     ao entrar nela, e sincroniza o RTDB leaderboard.
 *  4. sdrRankingWeights reconfigurado muda a ordem do pódio da TV — reunião
 *     realizada passa a valer mais que visita agendada.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,database,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-gamification-settings-emulator.mjs"
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9001';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT}` });
const db = admin.firestore();
const rtdb = admin.database();

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fn();
    if (r) return r;
    await sleep(500);
  }
  return null;
}

const userRef = (id) => db.doc(`tenants/${TENANT}/users/${id}`);
const dealRef = (id) => db.doc(`tenants/${TENANT}/deals/${id}`);

// ── Seed ────────────────────────────────────────────────────────────────────
await userRef('rep-quim').set({ uid: 'rep-quim', name: 'Joaquim Rep', role: 'rep', isActive: true, productIds: ['wizmart'], color: '#1A6B1A', points: 0 });
await userRef('sdr-ana').set({ uid: 'sdr-ana', name: 'Ana Lima', role: 'sdr', isActive: true, productIds: ['wizmart'], color: '#B45309' });
await userRef('sdr-bia').set({ uid: 'sdr-bia', name: 'Bia Costa', role: 'sdr', isActive: true, productIds: ['wizmart'], color: '#0E7490' });

// Funil mínimo, com uma etapa que já pontua (pointsOnEnter) — testa que ela
// convive com coinsOnEnter no mesmo documento, sem um interferir no outro.
await db.doc(`tenants/${TENANT}/funnels/wizmart`).set({
  id: 'wizmart', name: 'WizMart', type: 'main', productId: 'wizmart', isActive: true,
  stages: [
    { id: 'lista_potencial', name: 'Lista Potencial', order: 1, coinsOnEnter: 0, pointsOnEnter: 0, slaBusinessDays: 2, isHandoffRequired: false, defaultTemplateIds: [] },
    { id: 'proposta_apresentada', name: 'Proposta Apresentada', order: 2, coinsOnEnter: 1, pointsOnEnter: 40, slaBusinessDays: 7, isHandoffRequired: false, defaultTemplateIds: [] },
    // coinsOnEnter zerado de propósito: o cenário 1 testa só o bônus de pts do
    // onDealWon, sem outra moeda entrando no meio pra não confundir a
    // contagem do coin_ledger do cenário 3.
    { id: 'inaugurado', name: 'Inaugurado', order: 3, coinsOnEnter: 0, pointsOnEnter: 0, slaBusinessDays: 0, isHandoffRequired: false, defaultTemplateIds: [] },
  ],
});

// dealCreated zerado ANTES de criar qualquer deal — isola o cenário 1 (bônus
// de negócio ganho) do bônus de criação, que senão somaria +5 por deal e
// atrapalharia a conta. Também já serve de prova de que dealCreated é
// configurável, igual aos outros.
await db.doc(`tenants/${TENANT}/settings/gamification`).set({ actionPoints: { dealCreated: 0 } });

const dealTask = { id: 'd-task', name: 'Cliente Task', company: 'Cliente Task', value: 1000, stage: 'lista_potencial', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', status: 'open', owner: 'rep-quim', tasks: { e: false, w: false, m: false }, createdAt: new Date(), updatedAt: new Date() };
await dealRef('d-task').set(dealTask);

const dealStage = { ...dealTask, id: 'd-stage', name: 'Cliente Stage', company: 'Cliente Stage' };
await dealRef('d-stage').set(dealStage);

const dealWon = { ...dealTask, id: 'd-won', name: 'Cliente Won', company: 'Cliente Won' };
await dealRef('d-won').set(dealWon);

await sleep(1500);

// ── 1. Sem settings/gamification: dealWon continua valendo 100 (o fixo de antes) ──
await dealRef('d-won').update({ stage: 'inaugurado', updatedAt: new Date() });
const wonPts = await waitFor(async () => {
  const s = await userRef('rep-quim').get();
  const p = s.data()?.points || 0;
  return p >= 100 ? p : null;
});
report(wonPts === 100, '1. sem documento de pontuação, negócio ganho continua valendo 100 pts (padrão = valor fixo de antes)', `pontos: ${wonPts}`);

// ── 2. Com settings/gamification: onTaskComplete usa o valor CUSTOM ─────────
await db.doc(`tenants/${TENANT}/settings/gamification`).set(
  { actionPoints: { emailSent: 7 } }, // só email customizado — o resto (incl. dealCreated) fica como já estava
  { merge: true },
);
await sleep(800); // não há trigger nesse doc — só garante que a leitura seguinte já vê o valor novo
await dealRef('d-task').update({ 'tasks.e': true });
const afterEmail = await waitFor(async () => {
  const s = await userRef('rep-quim').get();
  const p = s.data()?.points || 0;
  return p > wonPts ? p : null;
});
report(afterEmail === wonPts + 7, '2. email enviado credita o valor CUSTOM (7 pts), não o 15 fixo de antes', `pontos: ${afterEmail}`);

// ── 3. pointsOnEnter da etapa credita pts e sincroniza o RTDB leaderboard ───
await dealRef('d-stage').update({ stage: 'proposta_apresentada', updatedAt: new Date() });
const afterStage = await waitFor(async () => {
  const s = await userRef('rep-quim').get();
  const p = s.data()?.points || 0;
  return p > afterEmail ? p : null;
});
report(afterStage === afterEmail + 40, '3. pointsOnEnter da etapa (Proposta Apresentada, 40 pts) creditado', `pontos: ${afterStage}`);
const lb = await waitFor(async () => (await rtdb.ref(`tenants/${TENANT}/leaderboard/rep-quim`).get()).val());
report(lb?.pts === afterStage, '3b. RTDB leaderboard sincronizado com o total novo', JSON.stringify(lb));
const ledger = await db.collection(`tenants/${TENANT}/coin_ledger`).where('userId', '==', 'rep-quim').get();
report(ledger.size === 1 && ledger.docs[0].data().amount === 1, '3c. coinsOnEnter da mesma etapa (1 moeda) não foi afetado pelo pointsOnEnter');

// ── 4. sdrRankingWeights reconfigurado muda a ordem do pódio ────────────────
await dealRef('d-task').update({ owner: 'sdr-ana', assignedSdrId: 'sdr-ana' });
await dealRef('d-stage').update({ owner: 'sdr-bia', assignedSdrId: 'sdr-bia' });
await dealRef('d-task').update({ stage: 'visita_agendada', updatedAt: new Date() }); // Ana: 1 visita
await sleep(1200);
await dealRef('d-stage').update({ stage: 'reuniao_agendada', updatedAt: new Date() });
await sleep(1200);
await dealRef('d-stage').update({ stage: 'reuniao_realizada', updatedAt: new Date() });
await sleep(1200);

await db.doc(`tenants/${TENANT}/settings/gamification`).set(
  { sdrRankingWeights: { visits: 1, meetingsDone: 10, actPct: 0 } }, // reunião realizada passa a valer mais que visita
  { merge: true },
);

const TOKEN = 'tv_teste_pesos';
await db.doc(`tenants/${TENANT}/tv_links/link-pesos`).set({
  token: TOKEN, deviceName: 'TV Pesos', productId: 'wizmart', active: true, expires: 'Nunca expira',
  allowedMetrics: ['ranking_sdr'], rankingPeriod: 'week',
});
const snap = await waitFor(async () => {
  const v = (await rtdb.ref(`public_tv/${TOKEN}`).get()).val();
  return v?.ranking_sdr?.week ? v : null;
});
report(!!snap, '4. snapshot da TV com pesos reconfigurados');
if (snap) {
  const week = snap.ranking_sdr.week;
  report(week[0]?.name === 'Bia', '4b. com reunião realizada valendo mais, Bia (1 reunião) passa Ana (1 visita) no pódio', JSON.stringify(week));
}

console.log(allOk ? '\n🎉 Pontuação configurável validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
