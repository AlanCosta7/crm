/**
 * test-deal-participants-emulator.mjs — valida a CF onDealParticipantsChanged
 * (Fase A do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md).
 *
 * Cobre os casos de negócio confirmados com o Alan em 22/08:
 *  - criação simples (owner-only, ex.: manager criando direto) → participante único
 *  - cadeia normal BDR→SDR→Rep → todos os 3 assinam
 *  - Rep recusa handoff (assignedRepId volta a null) → sai de participantIds
 *  - lead perdido devolvido ao BDR (assignedSdrId volta a null) → SDR original sai
 *  - responsibleId sempre reflete o "dono atual"
 *
 * Uso:
 *   firebase emulators:exec --config firebase.emutest.json \
 *     --only auth,firestore,functions --project demo-wizmart \
 *     "node scripts/test-deal-participants-emulator.mjs"
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

async function makeDeal(fields) {
  const ref = await db.collection(`tenants/${TENANT}/deals`).add({
    name: 'Deal Assinaturas', company: 'X', value: 0, stage: 'qualificacao',
    funnelId: 'f1', funnelType: 'farmer', productId: 'wizmart',
    due: '—', status: 'open', tasks: { e: false, w: false, m: false },
    createdAt: new Date(), updatedAt: new Date(),
    ...fields,
  });
  return ref;
}

// Triggers do emulador têm latência variável — poll até a condição bater.
async function waitFor(ref, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await ref.get();
    if (predicate(snap.data())) return snap.data();
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

function sameSet(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

let allOk = true;
async function check(label, ref, predicate) {
  const data = await waitFor(ref, predicate);
  const ok = data !== null && predicate(data);
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${ok ? '' : ` — participantIds=[${(data?.participantIds || []).join(', ')}] responsibleId=${data?.responsibleId}`}`);
  return data;
}

// 1. Criação simples (ex.: manager criando direto, sem bdrId/assignedSdrId) —
//    o próprio owner precisa virar participante, senão ele fica trancado fora
//    do próprio card assim que a rule de leitura (Fase B) entrar no ar.
const d1 = await makeDeal({ owner: 'mgr-1' });
await check('owner-only → participante único + responsável', d1,
  d => sameSet(d?.participantIds || [], ['mgr-1']) && d?.responsibleId === 'mgr-1');

// 2. Cadeia normal BDR→SDR→Rep — todos os 3 devem assinar.
const d2 = await makeDeal({ owner: 'bdr-1', bdrId: 'bdr-1', assignedSdrId: 'sdr-1', assignedRepId: 'rep-1' });
await check('BDR+SDR+Rep → 3 assinaturas, responsável = Rep', d2,
  d => sameSet(d?.participantIds || [], ['bdr-1', 'sdr-1', 'rep-1']) && d?.responsibleId === 'rep-1');

// 3. Rep recusa handoff — assignedRepId volta a null (mesmo campo que
//    declineHandoff.ts zera de verdade). O Rep recusado NÃO deve ficar
//    assinado — "ele não participa do comissionamento" (confirmado 22/08).
const d3 = await makeDeal({ owner: 'bdr-2', bdrId: 'bdr-2', assignedSdrId: 'sdr-2', assignedRepId: 'rep-2' });
await check('antes da recusa: Rep assinado', d3,
  d => (d?.participantIds || []).includes('rep-2'));
await d3.update({ assignedRepId: null, handoffStatus: 'pending', updatedAt: new Date() });
await check('após recusa: Rep sai de participantIds, responsável volta ao SDR', d3,
  d => sameSet(d?.participantIds || [], ['bdr-2', 'sdr-2']) && d?.responsibleId === 'sdr-2');

// 4. Lead perdido devolvido ao BDR — assignedSdrId volta a null (mesmo campo
//    que o LostReasonModal zera hoje). SDR original sai; comissão fica só
//    para quem estiver assinado quando o card fechar de verdade.
const d4 = await makeDeal({ owner: 'bdr-3', bdrId: 'bdr-3', assignedSdrId: 'sdr-3' });
await d4.update({ assignedSdrId: null, status: 'lost', requeuedForBdr: true, updatedAt: new Date() });
await check('lead devolvido ao BDR: SDR sai, responsável volta ao BDR', d4,
  d => sameSet(d?.participantIds || [], ['bdr-3']) && d?.responsibleId === 'bdr-3');

// BDR reativa e atribui a um SDR diferente do original — participantIds reflete
// só o atual (bate com "a comissão é paga sempre para os atuais").
await d4.update({ assignedSdrId: 'sdr-4', status: 'in_queue', requeuedForBdr: false, updatedAt: new Date() });
await check('reativado com SDR diferente: só o novo SDR assina', d4,
  d => sameSet(d?.participantIds || [], ['bdr-3', 'sdr-4']) && d?.responsibleId === 'sdr-4');

console.log(allOk ? '\n🎉 TODOS os cenários de participantIds/responsibleId validados' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
