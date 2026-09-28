/**
 * Backfill de escopo de produto.
 *
 * Dry-run por padrão:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill/backfill-product-scope.mjs
 *
 * Aplicar:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill/backfill-product-scope.mjs --apply
 *
 * Sincronizar custom claims dos usuários:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/backfill/backfill-product-scope.mjs --apply --sync-claims
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const PRODUCT_IDS = new Set(['wizmart', 'smart_cafe']);
const GLOBAL_PRODUCT = 'all';

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
const syncClaims = args.has('sync-claims') || process.env.SYNC_CLAIMS === 'true';
const tenantId = String(args.get('tenant') || process.env.TENANT_ID || 'wizmart_sp');
const legacyProductId = normalizeProductId(args.get('product') || process.env.LEGACY_PRODUCT_ID || 'wizmart', 'wizmart');
const limit = args.has('limit') ? Number(args.get('limit')) : null;
const projectId = process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'demo-wizmart-crm-local';

if (!Number.isFinite(limit) && limit !== null) {
  throw new Error('--limit deve ser um número.');
}

admin.initializeApp({ projectId });

const db = admin.firestore();
const auth = admin.auth();

const tenantRef = db.collection('tenants').doc(tenantId);
const tenantPath = `tenants/${tenantId}`;
const summaries = [];
let pendingBatch = db.batch();
let pendingWrites = 0;

console.log(`[backfill-product-scope] Projeto: ${projectId}`);
console.log(`[backfill-product-scope] Tenant: ${tenantId}`);
console.log(`[backfill-product-scope] Firestore: ${process.env.FIRESTORE_EMULATOR_HOST || 'credenciais padrão'}`);
console.log(`[backfill-product-scope] Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`[backfill-product-scope] Produto legado: ${legacyProductId}`);
if (syncClaims) console.log(`[backfill-product-scope] Custom claims: ${apply ? 'sincronização ativa' : 'dry-run'}`);

const tenantSnap = await tenantRef.get();
if (!tenantSnap.exists) {
  throw new Error(`Tenant ${tenantPath} não encontrado.`);
}

const dealProducts = await loadProductMap('deals');
const activityProducts = new Map([
  ...(await loadProductMap('activities')),
  ...(await loadProductMap('activity')),
]);
const prizeProducts = await loadProductMap('prizes');

await backfillProductIdsCollection('users', doc => {
  const data = doc.data();
  return Array.isArray(data.productIds) && data.productIds.length > 0
    ? sanitizeProductIds(data.productIds, [legacyProductId])
    : [legacyProductId];
});

await backfillProductIdsCollection('contacts', doc => inferProductIdsFromEntity(doc, ['dealId', 'deals']));
await backfillProductIdsCollection('companies', doc => inferProductIdsFromEntity(doc, ['dealId', 'deals']));
await backfillProductIdsCollection('sellers', doc => {
  const data = doc.data();
  return Array.isArray(data.productIds) && data.productIds.length > 0
    ? sanitizeProductIds(data.productIds, [legacyProductId])
    : [legacyProductId];
});

await backfillProductIdCollection('deals', () => legacyProductId);
await backfillProductIdCollection('funnels', () => legacyProductId);
await backfillProductIdCollection('activities', doc => inferProductIdFromRefs(doc));
await backfillProductIdCollection('activity', doc => inferProductIdFromRefs(doc));
await backfillProductIdCollection('handoffs', doc => inferProductIdFromRefs(doc));
await backfillProductIdCollection('templates', () => legacyProductId);
await backfillProductIdCollection('coin_ledger', doc => inferProductIdFromRefs(doc));
await backfillProductIdCollection('coin_redemptions', doc => inferProductIdFromRedemption(doc));
await backfillProductIdCollection('prizes', () => GLOBAL_PRODUCT);
await backfillProductIdCollection('tv_links', () => GLOBAL_PRODUCT);
await backfillKpiSnapshots();

await flushBatch();

if (syncClaims) {
  await syncUserClaims();
}

printSummary();

function normalizeProductId(value, fallback) {
  return PRODUCT_IDS.has(value) ? value : fallback;
}

function normalizeProductScope(value, fallback = legacyProductId) {
  if (value === GLOBAL_PRODUCT) return GLOBAL_PRODUCT;
  return normalizeProductId(value, fallback);
}

function sanitizeProductIds(values, fallback) {
  const ids = values.filter(value => PRODUCT_IDS.has(value));
  return ids.length > 0 ? [...new Set(ids)] : fallback;
}

function fieldMissing(data, field) {
  return data[field] === undefined || data[field] === null;
}

async function getCollectionSnapshot(collectionName) {
  let query = db.collection(`${tenantPath}/${collectionName}`);
  if (limit) query = query.limit(limit);
  return query.get();
}

async function loadProductMap(collectionName) {
  const snap = await getCollectionSnapshot(collectionName);
  return snap.docs.map(doc => {
    const data = doc.data();
    const productId = data.productId === GLOBAL_PRODUCT ? GLOBAL_PRODUCT : normalizeProductId(data.productId, legacyProductId);
    return [doc.id, productId];
  });
}

async function backfillProductIdCollection(collectionName, inferProductId) {
  const snap = await getCollectionSnapshot(collectionName);
  const summary = makeSummary(collectionName);

  for (const doc of snap.docs) {
    summary.scanned += 1;
    const data = doc.data();
    if (!fieldMissing(data, 'productId')) {
      summary.skipped += 1;
      continue;
    }

    const productId = normalizeProductScope(await inferProductId(doc), legacyProductId);
    await queueUpdate(doc.ref, { productId }, summary);
  }

  summaries.push(summary);
}

async function backfillProductIdsCollection(collectionName, inferProductIds) {
  const snap = await getCollectionSnapshot(collectionName);
  const summary = makeSummary(collectionName);

  for (const doc of snap.docs) {
    summary.scanned += 1;
    const data = doc.data();
    if (Array.isArray(data.productIds) && data.productIds.length > 0) {
      const sanitized = sanitizeProductIds(data.productIds, [legacyProductId]);
      if (JSON.stringify(sanitized) !== JSON.stringify(data.productIds)) {
        await queueUpdate(doc.ref, { productIds: sanitized }, summary);
      } else {
        summary.skipped += 1;
      }
      continue;
    }

    const productIds = sanitizeProductIds(await inferProductIds(doc), [legacyProductId]);
    await queueUpdate(doc.ref, { productIds }, summary);
  }

  summaries.push(summary);
}

async function backfillKpiSnapshots() {
  const snap = await getCollectionSnapshot('kpi_snapshots');
  const summary = makeSummary('kpi_snapshots');

  for (const doc of snap.docs) {
    summary.scanned += 1;
    const data = doc.data();
    if (data.productId === null || data.productId === GLOBAL_PRODUCT || PRODUCT_IDS.has(data.productId)) {
      summary.skipped += 1;
      continue;
    }

    const productFromId = String(doc.id).split(':')[2];
    const productId = normalizeProductScope(productFromId, legacyProductId);
    await queueUpdate(doc.ref, { productId: productId === GLOBAL_PRODUCT ? null : productId }, summary);
  }

  summaries.push(summary);
}

function inferProductIdsFromEntity(doc, fields) {
  const data = doc.data();
  const ids = new Set();

  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && dealProducts.has(value)) {
      ids.add(dealProducts.get(value));
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && dealProducts.has(item)) ids.add(dealProducts.get(item));
        if (item && typeof item === 'object' && typeof item.id === 'string' && dealProducts.has(item.id)) {
          ids.add(dealProducts.get(item.id));
        }
      }
    }
  }

  return [...ids].filter(id => PRODUCT_IDS.has(id));
}

function inferProductIdFromRefs(doc) {
  const data = doc.data();
  if (typeof data.dealId === 'string' && dealProducts.has(data.dealId)) return dealProducts.get(data.dealId);
  if (typeof data.activityId === 'string' && activityProducts.has(data.activityId)) return activityProducts.get(data.activityId);
  if (typeof data.prizeId === 'string' && prizeProducts.has(data.prizeId)) return prizeProducts.get(data.prizeId);
  return legacyProductId;
}

function inferProductIdFromRedemption(doc) {
  const data = doc.data();
  if (typeof data.prizeId === 'string' && prizeProducts.has(data.prizeId)) {
    const prizeProduct = prizeProducts.get(data.prizeId);
    return prizeProduct === GLOBAL_PRODUCT ? legacyProductId : prizeProduct;
  }
  return inferProductIdFromRefs(doc);
}

function makeSummary(collection) {
  return { collection, scanned: 0, changes: 0, skipped: 0 };
}

async function queueUpdate(ref, payload, summary) {
  summary.changes += 1;
  if (!apply) return;

  pendingBatch.set(ref, payload, { merge: true });
  pendingWrites += 1;
  if (pendingWrites >= 400) {
    await flushBatch();
  }
}

async function flushBatch() {
  if (!apply || pendingWrites === 0) return;
  await pendingBatch.commit();
  pendingBatch = db.batch();
  pendingWrites = 0;
}

async function syncUserClaims() {
  const usersSnap = await db.collection(`${tenantPath}/users`).get();
  const summary = makeSummary('auth_custom_claims');

  for (const doc of usersSnap.docs) {
    summary.scanned += 1;
    const data = doc.data();
    const productIds = sanitizeProductIds(data.productIds || [], [legacyProductId]);
    const role = data.role || 'viewer';
    summary.changes += 1;

    if (apply) {
      await auth.setCustomUserClaims(doc.id, {
        tenantId,
        role,
        productIds,
      });
    }
  }

  summaries.push(summary);
}

function printSummary() {
  console.log('\nColeção                  Lidos  Alterações  Ignorados');
  console.log('------------------------------------------------------');
  for (const item of summaries) {
    console.log(`${item.collection.padEnd(24)} ${String(item.scanned).padStart(5)} ${String(item.changes).padStart(10)} ${String(item.skipped).padStart(9)}`);
  }
  console.log('------------------------------------------------------');
  console.log(apply ? 'Backfill aplicado.' : 'Dry-run concluído. Use --apply para gravar.');
}
