/**
 * test-project-flow-emulator.mjs — Fluxo de Solicitação de Projeto com as Cloud
 * Functions reais (PLANO_DESENHO_CRM_2.md, A5/A7).
 *
 *  1. Solicitar → evento `project_requested` na timeline do card + aviso no sino
 *     de CADA usuário Design ativo (e de ninguém mais).
 *  2. O Design pega → evento `project_in_progress` com o NOME do designer.
 *  3. O Design entrega com arquivo → evento `project_delivered` com os links e
 *     aviso para quem solicitou. Não grava mais a `activity` de nota antiga.
 *
 * Uso: firebase emulators:exec --config firebase.emutest.json \
 *        --only auth,firestore,functions --project demo-wizmart-crm-local \
 *        "node scripts/test-emulator/test-project-flow-emulator.mjs"
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

let allOk = true;
const report = (ok, label, d = '') => { if (!ok) allOk = false; console.log(`${ok ? '✅' : '🔴'} ${label}${d ? ` — ${d}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 25000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const r = await fn(); if (r) return r; await sleep(500); }
  return null;
}
const events = async (dealId) =>
  (await db.collection(`tenants/${TENANT}/deal_timeline/${dealId}/events`).get()).docs.map((d) => d.data());
const notifs = async (userId) =>
  (await db.collection(`tenants/${TENANT}/notifications`).where('userId', '==', userId).get()).docs.map((d) => d.data());

const user = (uid, name, role, extra = {}) => db.doc(`tenants/${TENANT}/users/${uid}`).set({ uid, name, role, isActive: true, productIds: ['wizmart'], ...extra });
await user('rep-p', 'Carla Rep', 'rep');
await user('des-1', 'Fernanda Design', 'design');
await user('des-2', 'Paulo Design', 'design');
await user('des-off', 'Inativa Design', 'design', { isActive: false });
await user('sdr-p', 'João SDR', 'sdr');
await db.doc(`tenants/${TENANT}/deals/deal-p`).set({ name: 'CSN', company: 'CSN', productId: 'wizmart', stage: 'conectado', status: 'open', owner: 'rep-p', assignedRepId: 'rep-p', createdAt: new Date() });
await sleep(1500);

// 1. Solicitar
const reqRef = db.doc(`tenants/${TENANT}/project_requests/req-1`);
await reqRef.set({
  dealId: 'deal-p', companyName: 'CSN', requestedBy: 'rep-p', requestedByName: 'Carla Rep', requestedByRole: 'rep',
  pdvTypes: ['nanomarket', 'store'], quantities: { gondola: 2 }, walls: {}, notes: '', mediaUrls: [], status: 'pending',
  requestedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: new Date(),
});
const ev1 = await waitFor(async () => { const e = (await events('deal-p')).filter((x) => x.type === 'project_requested'); return e.length ? e : null; });
report(!!ev1, '1. solicitar grava `project_requested` na timeline do card');
report(ev1?.[0]?.message.includes('Nanomarket + Loja'), '1b. texto com o rótulo do cliente ("Loja")', ev1?.[0]?.message);
const nDes = await waitFor(async () => { const a = await notifs('des-1'); return a.length ? a : null; });
report(!!nDes && nDes[0].link === '/design-queue', '1c. Design é avisado e o sino leva à fila');
const nDes2 = await notifs('des-2');
const nOff = await notifs('des-off');
const nRep = await notifs('rep-p');
report(nDes2.length === 1, '1d. TODO usuário Design ativo é avisado');
report(nOff.length === 0 && nRep.length === 0, '1e. Design inativo e o próprio solicitante NÃO são avisados');

// 2. Design pega
await reqRef.update({ status: 'in_progress', assignedToDesignerId: 'des-1', assignedToDesignerName: 'Fernanda Design', updatedAt: new Date() });
const ev2 = await waitFor(async () => { const e = (await events('deal-p')).filter((x) => x.type === 'project_in_progress'); return e.length ? e : null; });
report(!!ev2, '2. o Design pegar o pedido grava `project_in_progress`');
report(ev2?.[0]?.message.includes('Fernanda Design') && !ev2?.[0]?.message.includes('des-1'), '2b. traz o NOME do designer, não o uid', ev2?.[0]?.message);

// 3. Entrega
await reqRef.update({
  status: 'delivered', deliveredAt: new Date(), deliveredByName: 'Fernanda Design', deliveredFileUrl: 'https://drive.example/proj',
  deliveredAttachments: [{ id: 'a1', name: 'layout.pdf', url: 'https://storage.example/layout.pdf', kind: 'document' }], updatedAt: new Date(),
});
const ev3 = await waitFor(async () => { const e = (await events('deal-p')).filter((x) => x.type === 'project_delivered'); return e.length ? e : null; });
report(!!ev3, '3. entregar grava `project_delivered`');
report(ev3?.[0]?.links?.some((l) => l.label === 'layout.pdf') && ev3?.[0]?.links?.some((l) => l.url === 'https://drive.example/proj'),
  '3b. o evento carrega o arquivo entregue e o link', JSON.stringify(ev3?.[0]?.links));
const nRep2 = await waitFor(async () => { const a = (await notifs('rep-p')).filter((n) => n.type === 'project_delivered'); return a.length ? a : null; });
report(!!nRep2 && nRep2[0].dealId === 'deal-p', '3c. quem solicitou é avisado da entrega, com link para o card');
const acts = (await db.collection(`tenants/${TENANT}/activities`).where('userId', '==', 'rep-p').get()).docs.filter((d) => d.data().type === 'note');
report(acts.length === 0, '3d. não grava mais a `activity` de nota que inflava o feed');

console.log(allOk ? '\n🎉 Fluxo de projeto validado no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
