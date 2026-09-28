/**
 * test-ranking-sdr-emulator.mjs — Ranking do Time de SDRs na TV, ponta a ponta
 * (PLANO_DESENHO_CRM_2.md, Fase B) no EMULADOR, com as Cloud Functions reais.
 *
 * Cenários:
 *  1. Trocar a etapa do deal grava um evento por passagem em `sdr_events`
 *     (reunião agendada/realizada, visita agendada), no SDR atribuído.
 *  2. Voltar o card e reentrar na mesma etapa NÃO conta de novo (id determinístico).
 *  3. O snapshot público da TV (`public_tv/{token}`) traz `ranking_sdr` com os 3
 *     períodos, ordenado por visitas — e só primeiro nome/iniciais/contagens.
 *  4. Sem a métrica `ranking_sdr` no link, o dado NÃO vai para o nó público.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,database,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-ranking-sdr-emulator.mjs"
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

const deal = (id, sdr) => db.doc(`tenants/${TENANT}/deals/${id}`);
const baseDeal = (name, sdr) => ({
  name, company: name, value: 1000, stage: 'conectado', funnelId: 'wizmart', funnelType: 'main',
  productId: 'wizmart', mainProduct: 'wizmart_minimercado', status: 'open',
  owner: sdr, assignedSdrId: sdr, createdAt: new Date(), updatedAt: new Date(),
});

// ── Seed ────────────────────────────────────────────────────────────────────
await db.doc(`tenants/${TENANT}/users/sdr-ana`).set({ uid: 'sdr-ana', name: 'Ana Souza Lima', email: 'ana-secreta@wizmart.com.br', role: 'sdr', isActive: true, productIds: ['wizmart'], color: '#B45309' });
await db.doc(`tenants/${TENANT}/users/sdr-bia`).set({ uid: 'sdr-bia', name: 'Bia Costa', email: 'bia-secreta@wizmart.com.br', role: 'sdr', isActive: true, productIds: ['wizmart'], color: '#0E7490' });
await deal('d-ana-1').set(baseDeal('Cliente A1', 'sdr-ana'));
await deal('d-ana-2').set(baseDeal('Cliente A2', 'sdr-ana'));
await deal('d-bia-1').set(baseDeal('Cliente B1', 'sdr-bia'));
// Leaderboard legado no RTDB (chave = uid): não pode vazar uid nem sobrenome.
await rtdb.ref(`tenants/${TENANT}/leaderboard/sdr-ana`).set({ name: 'Ana Souza Lima', pts: 120, initials: 'AL', color: '#B45309' });
await sleep(1500);

// Ana: 2 visitas + reunião agendada + reunião realizada. Bia: 1 visita.
await deal('d-ana-1').update({ stage: 'reuniao_agendada', updatedAt: new Date() });
await sleep(1200);
await deal('d-ana-1').update({ stage: 'reuniao_realizada', updatedAt: new Date() });
await sleep(1200);
await deal('d-ana-1').update({ stage: 'visita_agendada', updatedAt: new Date() });
await deal('d-ana-2').update({ stage: 'visita_agendada', updatedAt: new Date() });
await deal('d-bia-1').update({ stage: 'visita_agendada', updatedAt: new Date() });

const events = await waitFor(async () => {
  const s = await db.collection(`tenants/${TENANT}/sdr_events`).get();
  return s.size >= 5 ? s : null;
});
report(!!events, '1. uma passagem de etapa vira um evento em sdr_events', `${events?.size ?? 0} evento(s)`);
const ids = events ? events.docs.map((d) => d.id).sort() : [];
report(
  ids.includes('d-ana-1__meeting_scheduled') && ids.includes('d-ana-1__meeting_done') && ids.includes('d-ana-1__visit_scheduled'),
  '1b. reunião agendada, reunião realizada e visita agendada gravadas para o mesmo deal',
);

// 2. Idempotência: volta e reentra em visita_agendada.
await deal('d-bia-1').update({ stage: 'conectado', updatedAt: new Date() });
await sleep(1500);
await deal('d-bia-1').update({ stage: 'visita_agendada', updatedAt: new Date() });
await sleep(2500);
const bia = await db.collection(`tenants/${TENANT}/sdr_events`).where('sdrId', '==', 'sdr-bia').get();
report(bia.size === 1, '2. reentrar na mesma etapa NÃO conta a visita duas vezes', `eventos da Bia: ${bia.size}`);

// 3. Snapshot da TV com o ranking.
const TOKEN = 'tv_teste_ranking';
await db.doc(`tenants/${TENANT}/tv_links/link-ranking`).set({
  token: TOKEN, deviceName: 'TV Teste', productId: 'wizmart', active: true, expires: 'Nunca expira',
  allowedMetrics: ['ranking_sdr'], rankingPeriod: 'week',
});
const snap = await waitFor(async () => {
  const v = (await rtdb.ref(`public_tv/${TOKEN}`).get()).val();
  return v?.ranking_sdr ? v : null;
});
report(!!snap, '3. snapshot público da TV contém ranking_sdr');
if (snap) {
  const week = snap.ranking_sdr.week ?? [];
  report(week[0]?.name === 'Ana' && week[0]?.visits === 2, '3b. Ana em 1º com 2 visitas (peso do pódio)', JSON.stringify(week[0]));
  report(week[1]?.name === 'Bia' && week[1]?.visits === 1, '3c. Bia em 2º com 1 visita');
  report(week[0]?.meetingsScheduled === 1 && week[0]?.meetingsDone === 1, '3d. reuniões agendadas e realizadas contadas por passagem de etapa');
  report(!!snap.ranking_sdr.day && !!snap.ranking_sdr.month, '3e. os três períodos (dia, semana, mês) vêm no snapshot');
  report(snap.rankingPeriod === 'week', '3f. período inicial do link chega à TV');
  const json = JSON.stringify(snap);
  report(
    !json.includes('sdr-ana') && !json.includes('ana-secreta') && !json.includes('Souza') && !json.includes('Lima'),
    '3g. nó PÚBLICO sem uid, e-mail nem sobrenome (só primeiro nome)',
  );
}

// 4. Gate: outro link, sem a métrica.
const TOKEN2 = 'tv_teste_sem_ranking';
await db.doc(`tenants/${TENANT}/tv_links/link-sem`).set({
  token: TOKEN2, deviceName: 'TV Sem Ranking', productId: 'wizmart', active: true, expires: 'Nunca expira',
  allowedMetrics: ['tarefas'],
});
const snap2 = await waitFor(async () => (await rtdb.ref(`public_tv/${TOKEN2}`).get()).val());
report(!!snap2 && !snap2.ranking_sdr, '4. link sem a métrica ranking_sdr NÃO recebe o dado no nó público');

console.log(allOk ? '\n🎉 Ranking de SDRs validado no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
