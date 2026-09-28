/**
 * migrate-legacy-deals-to-main-prod.mjs — Move os deals presos em funis
 * fragmentados/quebrados para o funil main equivalente, na etapa
 * semanticamente correspondente.
 *
 * Pré-requisito: scripts/migrations-prod/sync-main-funnels-prod.mjs já rodado (funis
 * `wizmart` e `smart_cafe` do tipo 'main' precisam existir).
 *
 * Mapeamento (old funnelId + old stage) -> (novo funnelId + novo stage),
 * levantado por inspeção direta dos 13 deals reais de produção em 01/09/2026:
 *
 *   C5qobLwI26sa2lDuHVA0 ("BDR - Outbound", 1 única etapa "Lista Potencial")
 *     -> wizmart / lista_potencial      (mesma etapa, funil correto)
 *   inbound-wizmart / "Lead Pré Qualificado"
 *     -> wizmart / prospeccao           (equivalente semântico mais próximo)
 *   inbound-smart_cafe / "Pré-Qualificado"
 *     -> smart_cafe / prospeccao
 *   hunter-smart_cafe / "Prospecção"
 *     -> smart_cafe / prospeccao        (nome idêntico)
 *
 * Por que é seguro (checado antes de escrever):
 *   - `onDealStageChanged` só reage a `before.stage !== after.stage`; as duas
 *     etapas de destino (`lista_potencial`, `prospeccao`) têm coinsOnEnter=0
 *     e não são nenhuma das etapas com efeito especial (visita_agendada,
 *     inaugurado, instalacao_agendada) — zero moedas, zero KPI, zero
 *     cohortKeys disparados por esta migração.
 *   - `onDealTimelineEvents`/`onDealParticipantsChanged` não olham para
 *     stage/funnelId.
 *
 * `updatedAt` é atualizado (como um drag-and-drop real faria) para o SLA da
 * nova etapa contar a partir de agora, não da última edição antiga do deal.
 * `createdAt` nunca é tocado.
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin (ADC):
 *    gcloud auth application-default login
 *
 * Uso:
 *   node scripts/migrations-prod/migrate-legacy-deals-to-main-prod.mjs             # aplica
 *   node scripts/migrations-prod/migrate-legacy-deals-to-main-prod.mjs --dry-run    # só mostra
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId = process.env.TENANT_ID || 'wizmart';

delete process.env.FIRESTORE_EMULATOR_HOST;

const app = admin.initializeApp({ projectId }, `migrate-${Date.now()}`);
const db = app.firestore();
const base = `tenants/${tenantId}`;
const TS = admin.firestore.FieldValue.serverTimestamp;

const key = (funnelId, stage) => `${funnelId}||${stage}`;

const MAPPING = new Map([
  [key('C5qobLwI26sa2lDuHVA0', 'lista_potencial_1782870811629'), { funnelId: 'wizmart', stage: 'lista_potencial' }],
  [key('inbound-wizmart', 'lead_pré_qualificado_1783036403638'), { funnelId: 'wizmart', stage: 'prospeccao' }],
  [key('inbound-smart_cafe', 'pré-qualificado_1783037792234'), { funnelId: 'smart_cafe', stage: 'prospeccao' }],
  [key('hunter-smart_cafe', 'prospecção_1783037064197'), { funnelId: 'smart_cafe', stage: 'prospeccao' }],
]);

async function main() {
  console.log(`\n[migrate-legacy-deals] projeto=${projectId} tenant=${tenantId} dryRun=${DRY_RUN}\n`);

  // Confirma que os funis destino existem antes de mover qualquer coisa
  for (const targetFunnelId of new Set([...MAPPING.values()].map(v => v.funnelId))) {
    const snap = await db.doc(`${base}/funnels/${targetFunnelId}`).get();
    if (!snap.exists) {
      console.error(`✗ Funil de destino '${targetFunnelId}' não existe. Rode sync-main-funnels-prod.mjs primeiro.`);
      process.exit(1);
    }
  }

  const dealsSnap = await db.collection(`${base}/deals`).get();
  let matched = 0;
  let skipped = 0;

  for (const doc of dealsSnap.docs) {
    const deal = doc.data();
    const mapped = MAPPING.get(key(deal.funnelId, deal.stage));
    if (!mapped) continue;

    matched += 1;
    console.log(
      `  "${deal.name}" (${deal.company || deal.companyName || '—'}) [${doc.id}]\n` +
      `    de: funnelId=${deal.funnelId} stage=${deal.stage} status=${deal.status}\n` +
      `    p/: funnelId=${mapped.funnelId} stage=${mapped.stage}`
    );

    if (!DRY_RUN) {
      await doc.ref.update({ funnelId: mapped.funnelId, stage: mapped.stage, updatedAt: TS() });
    }
  }

  skipped = dealsSnap.size - matched;
  console.log(`\n${matched} deal(s) migrado(s), ${skipped} deal(s) sem correspondência (não tocados).`);
  console.log(DRY_RUN ? '[dry-run] nada foi escrito.' : '✔ Concluído.');
  process.exit(0);
}

main().catch(err => {
  console.error('[migrate-legacy-deals] falhou:', err);
  process.exit(1);
});
