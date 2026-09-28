/**
 * backfill-deal-participants.mjs — popula participantIds/responsibleId nos
 * deals já existentes (criados antes da Cloud Function onDealParticipantsChanged).
 *
 * A CF só sincroniza a partir da 1ª escrita depois do deploy — deals antigos
 * ficam sem os campos até algo mexer neles. Este script varre a coleção uma
 * vez e aplica a mesma fórmula da CF (functions/src/deals/syncDealParticipants.ts).
 *
 * Dry-run por padrão:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill/backfill-deal-participants.mjs
 *
 * Aplicar (emulador):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill/backfill-deal-participants.mjs --apply
 *
 * Aplicar em produção (ADC já ativo via gcloud):
 *   SEED_TARGET=prod node scripts/backfill/backfill-deal-participants.mjs --apply --tenant=wizmart
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const args = new Map();
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--') && arg.includes('=')) {
    const [key, ...value] = arg.slice(2).split('=');
    args.set(key, value.join('='));
  } else if (arg.startsWith('--')) {
    args.set(arg.slice(2), true);
  }
}

const apply = args.has('apply');
const isProd = args.has('prod') || process.env.SEED_TARGET === 'prod';
const tenantId = String(args.get('tenant') || process.env.TENANT_ID || (isProd ? 'wizmart' : 'wizmart_sp'));
const projectId = process.env.GCLOUD_PROJECT
  || (isProd ? 'wizmart-crm' : (process.env.VITE_FIREBASE_PROJECT_ID || 'demo-wizmart-crm-local'));

if (isProd) {
  admin.initializeApp({ projectId, credential: admin.credential.applicationDefault() });
} else {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

function computeParticipantIds(data) {
  const raw = [data.owner, data.bdrId, data.assignedSdrId, data.assignedRepId];
  return [...new Set(raw.filter(v => typeof v === 'string' && v.length > 0))];
}

function computeResponsibleId(data) {
  return data.assignedRepId || data.assignedSdrId || data.bdrId || data.owner || '';
}

function sameArray(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

console.log(`[backfill-deal-participants] Projeto: ${projectId}`);
console.log(`[backfill-deal-participants] Tenant: ${tenantId}`);
console.log(`[backfill-deal-participants] Firestore: ${process.env.FIRESTORE_EMULATOR_HOST || 'credenciais padrão (produção)'}`);
console.log(`[backfill-deal-participants] Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

const snap = await db.collection(`tenants/${tenantId}/deals`).get();
console.log(`[backfill-deal-participants] ${snap.size} deals encontrados.\n`);

let scanned = 0;
let changed = 0;
let skipped = 0;
let batch = db.batch();
let pending = 0;

for (const docSnap of snap.docs) {
  scanned += 1;
  const data = docSnap.data();
  const participantIds = computeParticipantIds(data);
  const responsibleId = computeResponsibleId(data);

  const currentParticipants = Array.isArray(data.participantIds) ? data.participantIds : [];
  const needsUpdate = !sameArray(currentParticipants, participantIds) || (data.responsibleId || '') !== responsibleId;

  if (!needsUpdate) {
    skipped += 1;
    continue;
  }

  changed += 1;
  const label = data.name || data.company || docSnap.id;
  console.log(`  ${apply ? '✓' : '·'} ${docSnap.id} (${label}) → participantIds=[${participantIds.join(', ') || '—'}] responsibleId=${responsibleId || '—'}`);

  if (apply) {
    batch.update(docSnap.ref, { participantIds, responsibleId });
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
}

if (apply && pending > 0) {
  await batch.commit();
}

console.log('\n------------------------------------------------------');
console.log(`Lidos: ${scanned}  Alterações: ${changed}  Sem mudança: ${skipped}`);
console.log(apply ? 'Backfill aplicado.' : 'Dry-run concluído. Use --apply para gravar.');
