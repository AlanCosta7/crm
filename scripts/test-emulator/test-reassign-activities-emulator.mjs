/**
 * test-reassign-activities-emulator.mjs — troca de responsável do card.
 *
 * Valida `reassignPendingActivities` (functions/src/deals/reassignPendingActivities.ts)
 * direto contra o Firestore emulado, com o Google Calendar substituído por um
 * falso — não precisa do emulador de functions nem de credencial nenhuma.
 *
 * Uso: npm run test:reassign-activities
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

let reassignPendingActivities;
try {
  ({ reassignPendingActivities } = require('../../functions/lib/deals/reassignPendingActivities.js'));
} catch {
  console.error('Não encontrei functions/lib/deals/reassignPendingActivities.js.');
  console.error('Rode primeiro: npm --prefix functions run build');
  process.exit(1);
}

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local' });
const db = admin.firestore();

const T = 'wizmart';
const TODAY = '2026-09-21';
let allOk = true;
const report = (ok, label, detalhe = '') => {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
};

const calendarCalls = { deleted: [], created: [] };
const calendar = {
  deleteEvent: async (_t, userId, eventId) => { calendarCalls.deleted.push(`${userId}:${eventId}`); return true; },
  createEvent: async (_t, userId, input) => { calendarCalls.created.push(`${userId}:${input.activityId}`); return `evt-new-${input.activityId}`; },
};

const act = (id, extra) => db.doc(`tenants/${T}/activities/${id}`).set({
  dealId: 'deal-1', type: 'call', status: 'pending', cadenceType: 'sdr_daily',
  scheduledAt: new Date('2026-09-21T13:00:00Z'), contactName: 'X', companyName: 'X Ltda', productId: 'wizmart',
  ...extra,
});

// ── Cenário 1: SDR troca de sdr-1 para sdr-2 ─────────────────────────────────
await act('a-call',  { userId: 'sdr-1', type: 'call',  calendarEventId: 'evt-old-call' });
await act('a-email', { userId: 'sdr-1', type: 'email' });
await act('a-done',  { userId: 'sdr-1', type: 'linkedin', status: 'completed' });   // histórico: fica
await act('a-other', { userId: 'sdr-1', type: 'call', dealId: 'deal-OUTRO' });      // outro card: fica
await db.doc(`tenants/${T}/calendar_tokens/sdr-2`).set({ isConnected: true });
await db.doc(`tenants/${T}/cadence_queues/sdr-1/daily/${TODAY}`).set({
  cardsDistributed: 2, activitiesRequired: 4, activitiesCompleted: 0,
  cards: [
    { dealId: 'deal-1',     activities: { call: { activityId: 'a-call' }, email: { activityId: 'a-email' } } },
    { dealId: 'deal-OUTRO', activities: { call: { activityId: 'a-other' } } },
  ],
});

const r1 = await reassignPendingActivities(db, {
  tenantId: T, dealId: 'deal-1', todayBRT: TODAY, calendar,
  change: { field: 'assignedSdrId', oldUid: 'sdr-1', newUid: 'sdr-2' },
});
const get = async (id) => (await db.doc(`tenants/${T}/activities/${id}`).get()).data();

report(r1.moved === 2 && r1.deletedDuplicates === 0, 'move as 2 pendentes do card', JSON.stringify(r1));
report((await get('a-call')).userId === 'sdr-2' && (await get('a-email')).userId === 'sdr-2', 'pendentes agora estão no nome do sdr-2');
report((await get('a-done')).userId === 'sdr-1', 'atividade concluída fica com quem fez (histórico e moedas)');
report((await get('a-other')).userId === 'sdr-1', 'atividade de OUTRO card não é tocada');
report((await get('a-call')).reassignedFrom === 'sdr-1', 'registra de quem veio (auditoria)');
report(calendarCalls.deleted.join() === 'sdr-1:evt-old-call', 'apaga o evento do Calendar do sdr-1', calendarCalls.deleted.join());
report(calendarCalls.created.length === 2 && calendarCalls.created.every(c => c.startsWith('sdr-2:')), 'cria os eventos na agenda do sdr-2 (conectado)', calendarCalls.created.join());
report((await get('a-call')).calendarEventId === 'evt-new-a-call', 'grava o id do evento novo na atividade');

const q = (await db.doc(`tenants/${T}/cadence_queues/sdr-1/daily/${TODAY}`).get()).data();
report(q.cards.length === 1 && q.cards[0].dealId === 'deal-OUTRO', 'card sai da fila do dia do sdr-1; o outro fica', `${q.cards.length} card(s)`);
report(q.cardsDistributed === 1 && q.activitiesRequired === 2, 'contadores da fila acompanham', `cards=${q.cardsDistributed} required=${q.activitiesRequired}`);

// ── Cenário 2: idempotência ──────────────────────────────────────────────────
const r2 = await reassignPendingActivities(db, {
  tenantId: T, dealId: 'deal-1', todayBRT: TODAY, calendar,
  change: { field: 'assignedSdrId', oldUid: 'sdr-1', newUid: 'sdr-2' },
});
report(r2.moved === 0 && r2.deletedDuplicates === 0, 'segunda execução não encontra mais nada (idempotente)');

// ── Cenário 3: o novo SDR já recriou uma modalidade → apaga a antiga ─────────
await act('b-old-call',  { dealId: 'deal-2', userId: 'sdr-3', type: 'call' });
await act('b-old-email', { dealId: 'deal-2', userId: 'sdr-3', type: 'email' });
await act('b-new-call',  { dealId: 'deal-2', userId: 'sdr-4', type: 'call' });      // recriada pelo client
const r3 = await reassignPendingActivities(db, {
  tenantId: T, dealId: 'deal-2', todayBRT: TODAY, calendar,
  change: { field: 'assignedSdrId', oldUid: 'sdr-3', newUid: 'sdr-4' },
});
report(r3.moved === 1 && r3.deletedDuplicates === 1, 'call duplicada é apagada; email é movido', JSON.stringify(r3));
report(!(await db.doc(`tenants/${T}/activities/b-old-call`).get()).exists, 'a antiga duplicada não existe mais');
report((await get('b-old-email')).userId === 'sdr-4' && (await get('b-new-call')).userId === 'sdr-4', 'sdr-4 fica com uma call e um email');

// ── Cenário 4: Rep (sem fila do dia, novo responsável sem Calendar) ──────────
await act('c-1', { dealId: 'deal-3', userId: 'rep-1', type: 'whatsapp', calendarEventId: null });
const before = calendarCalls.created.length;
const r4 = await reassignPendingActivities(db, {
  tenantId: T, dealId: 'deal-3', todayBRT: TODAY, calendar,
  change: { field: 'assignedRepId', oldUid: 'rep-1', newUid: 'rep-2' },
});
report(r4.moved === 1 && (await get('c-1')).userId === 'rep-2', 'troca de Rep move a pendente');
report(calendarCalls.created.length === before, 'sem Calendar conectado no novo responsável, não cria evento');

console.log(allOk ? '\n🎉 troca de responsável validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
