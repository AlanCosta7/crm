/**
 * backfill-deal-origin.mjs — Grava `origin` ('inbound' | 'outbound') nos deals
 * que existem hoje. Fase 1.3 do PLANO_DESENHO_CRM.md.
 *
 * Por que precisa de backfill: a CF `onDealParticipantsChanged` deriva a origem
 * a cada escrita, mas um deal parado não é reescrito — ficaria sem o campo até
 * alguém tocar nele. E o filtro de origem do Pipeline, a quebra "1 Inbound /
 * 2 Outbound" dos dashboards e o board único dependem do campo preenchido.
 *
 * A regra de decisão é IMPORTADA da CF (`functions/lib/deals/dealOrigin.js`),
 * não reescrita aqui: duas implementações da mesma regra divergem com o tempo,
 * e aí o backfill grava um valor e o trigger grava outro. Rode
 * `npm --prefix functions run build` antes se `lib/` estiver desatualizado.
 *
 * Dry-run por padrão — não escreve nada sem `--apply`.
 *
 * Uso:
 *   node scripts/backfill/backfill-deal-origin.mjs                      # dry-run em produção
 *   node scripts/backfill/backfill-deal-origin.mjs --apply
 *   node scripts/backfill/backfill-deal-origin.mjs --apply --all-tenants
 *   node scripts/backfill/backfill-deal-origin.mjs --apply --emulator    # nos emuladores
 *
 * Em produção requer ADC: gcloud auth application-default login
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

let computeOrigin;
try {
  ({ computeOrigin } = require('../../functions/lib/deals/dealOrigin.js'));
} catch {
  console.error('Não encontrei functions/lib/deals/dealOrigin.js.');
  console.error('Rode primeiro: npm --prefix functions run build');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const ALL_TENANTS = process.argv.includes('--all-tenants');
const EMULADOR = process.argv.includes('--emulator');
const projectId = process.env.GCLOUD_PROJECT || (EMULADOR ? 'demo-wizmart-crm-local' : 'wizmart-crm');
const tenantIdArg = process.env.TENANT_ID || 'wizmart';

if (EMULADOR) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const app = admin.initializeApp({ projectId }, `backfill-origin-${Date.now()}`);
const db = app.firestore();

// Firestore aceita até 500 operações por batch; 400 deixa margem.
const BATCH_SIZE = 400;

async function backfillTenant(tenantId) {
  const snap = await db.collection(`tenants/${tenantId}/deals`).get();
  if (snap.empty) {
    console.log(`\n(${tenantId}) nenhum deal.`);
    return { total: 0, gravados: 0, jaOk: 0, divergentes: 0 };
  }

  console.log(`\n═══ Tenant ${tenantId} — ${snap.size} deal(s) ═══`);

  const pendentes = [];
  const contagem = { inbound: 0, outbound: 0 };
  let jaOk = 0;
  let divergentes = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const origin = computeOrigin(d);
    contagem[origin]++;

    if (d.origin === origin) { jaOk++; continue; }
    // Valor já gravado que discorda da regra: vale registrar, porque significa
    // um deal com origem forjada pela UI ou vindo de backfill antigo.
    if (d.origin && d.origin !== origin) {
      divergentes++;
      console.log(`   ↻ ${doc.id}: origin='${d.origin}' → '${origin}' (regra atual)`);
    }
    pendentes.push({ ref: doc.ref, origin });
  }

  console.log(`   distribuição final: ${contagem.inbound} Inbound / ${contagem.outbound} Outbound`);
  console.log(`   já corretos: ${jaOk} · a gravar: ${pendentes.length}${divergentes ? ` (${divergentes} corrigindo valor divergente)` : ''}`);

  if (!APPLY) {
    console.log('   (dry-run — nada foi gravado)');
    return { total: snap.size, gravados: 0, jaOk, divergentes };
  }

  for (let i = 0; i < pendentes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const p of pendentes.slice(i, i + BATCH_SIZE)) {
      // Só `origin` — não mexe em updatedAt, para não parecer atividade
      // recente no card nem alterar o cálculo de vencimento por inatividade.
      batch.update(p.ref, { origin: p.origin });
    }
    await batch.commit();
    console.log(`   gravado lote ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(BATCH_SIZE, pendentes.length - i)} deals)`);
  }

  return { total: snap.size, gravados: pendentes.length, jaOk, divergentes };
}

const tenants = ALL_TENANTS
  ? (await db.collection('tenants').get()).docs.map(d => d.id)
  : [tenantIdArg];

let totalGravados = 0;
for (const tid of tenants) {
  const r = await backfillTenant(tid);
  totalGravados += r.gravados;
}

console.log('\n' + '─'.repeat(60));
console.log(APPLY
  ? `✅ ${totalGravados} deal(s) atualizados.`
  : `Dry-run: ${totalGravados === 0 ? 'nada' : totalGravados} a gravar. Rode com --apply para aplicar.`);
process.exit(0);
