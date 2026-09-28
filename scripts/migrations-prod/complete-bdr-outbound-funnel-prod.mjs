/**
 * complete-bdr-outbound-funnel-prod.mjs — Completa as etapas do funil
 * "BDR - Outbound" (id C5qobLwI26sa2lDuHVA0) em PRODUÇÃO.
 *
 * Esse funil tinha uma única etapa ("Lista Potencial") e nenhuma outra para
 * onde avançar. Os 8 deals que estavam presos nele já foram migrados para o
 * funil `main` (scripts/migrations-prod/migrate-legacy-deals-to-main-prod.mjs) — hoje ele
 * está vazio, então completar suas etapas é uma operação sem nenhum deal
 * afetado.
 *
 * Fonte da lista de etapas: funil `wizmart` (main) rodando em localhost
 * (emulador, seed via scripts/seed/seed-emulators.mjs) — conferido byte a byte
 * idêntico ao mesmo funil em homologação (codifyx7/wizmart_sp), então usar
 * qualquer um dos dois dá o mesmo resultado.
 *
 * O que muda: só o campo `stages` deste ÚNICO doc (nome, id, type e
 * productId do funil são preservados como estão). Nenhum outro funil,
 * nenhum deal.
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin (ADC):
 *    gcloud auth application-default login
 *
 * Uso:
 *   node scripts/migrations-prod/complete-bdr-outbound-funnel-prod.mjs             # aplica
 *   node scripts/migrations-prod/complete-bdr-outbound-funnel-prod.mjs --dry-run    # só mostra
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId = process.env.TENANT_ID || 'wizmart';
const FUNNEL_ID = 'C5qobLwI26sa2lDuHVA0';

delete process.env.FIRESTORE_EMULATOR_HOST;

const app = admin.initializeApp({ projectId }, `complete-bdr-${Date.now()}`);
const db = app.firestore();
const base = `tenants/${tenantId}`;

// Idêntico ao funil `wizmart` (main) em localhost e em homologação.
const stages = [
  { id: 'lista_potencial',       name: 'Lista Potencial',       order: 1,  coinsOnEnter: 0, slaBusinessDays: 2,  isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
  { id: 'prospeccao',            name: 'Prospecção',            order: 2,  coinsOnEnter: 0, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#D8EDD8' },
  { id: 'conectado',             name: 'Conectado',             order: 3,  coinsOnEnter: 1, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#BAD4BA', hasConnectionSubtype: false },
  { id: 'visita_agendada',       name: 'Visita Agendada',       order: 4,  coinsOnEnter: 1, slaBusinessDays: 5,  isHandoffRequired: true,  defaultTemplateIds: [], color: '#8DB600', skipStagesForSubtype: [] },
  { id: 'visita_realizada',      name: 'Visita Realizada',      order: 5,  coinsOnEnter: 2, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#6DA000' },
  { id: 'proposta_apresentada',  name: 'Proposta Apresentada',  order: 6,  coinsOnEnter: 1, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#5A8A00' },
  { id: 'negociacao_contratual', name: 'Negociação Contratual', order: 7,  coinsOnEnter: 0, slaBusinessDays: 10, isHandoffRequired: false, defaultTemplateIds: [], color: '#3D6B00' },
  { id: 'contrato_assinado',     name: 'Contrato Assinado',     order: 8,  coinsOnEnter: 2, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#2A5000' },
  { id: 'instalacao_agendada',   name: 'Instalação Agendada',   order: 9,  coinsOnEnter: 1, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#1A3E00' },
  { id: 'instalacao_realizada',  name: 'Instalação Realizada',  order: 10, coinsOnEnter: 2, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#122D00' },
  { id: 'inaugurado',            name: 'Inaugurado',            order: 11, coinsOnEnter: 5, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#0D2800' },
  { id: 'perdeu',                name: 'Perdeu',                order: 12, coinsOnEnter: 0, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#4B1113', isLost: true },
];

async function main() {
  console.log(`\n[complete-bdr-outbound] projeto=${projectId} tenant=${tenantId} dryRun=${DRY_RUN}\n`);

  const ref = db.doc(`${base}/funnels/${FUNNEL_ID}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`✗ Funil ${FUNNEL_ID} não existe.`);
    process.exit(1);
  }
  const before = snap.data();
  console.log(`funnels/${FUNNEL_ID} "${before.name}" (${before.type}/${before.productId})`);
  console.log(`  hoje: ${before.stages?.length ?? 0} etapa(s)`);
  console.log(`  vai passar a ter: ${stages.length} etapas -> ${stages.map(s => s.name).join(' -> ')}`);

  const dealsInFunnel = await db.collection(`${base}/deals`).where('funnelId', '==', FUNNEL_ID).get();
  console.log(`  deals atualmente neste funil: ${dealsInFunnel.size}`);

  // Deal(s) ainda presos no id antigo da única etapa que existia — reaponta
  // para o novo id `lista_potencial` (mesmo funil, mesma posição semântica;
  // não é migração entre funis, só corrige a referência ao renomear o id).
  const OLD_STAGE_ID = 'lista_potencial_1782870811629';
  const toFix = dealsInFunnel.docs.filter(d => d.data().stage === OLD_STAGE_ID);
  for (const d of toFix) {
    console.log(`  reapontando "${d.data().name}" [${d.id}]: stage ${OLD_STAGE_ID} -> lista_potencial`);
    if (!DRY_RUN) {
      await d.ref.update({ stage: 'lista_potencial', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }

  if (!DRY_RUN) {
    await ref.update({ stages });
    console.log('\n✔ Concluído.');
  } else {
    console.log('\n[dry-run] nada foi escrito.');
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[complete-bdr-outbound] falhou:', err);
  process.exit(1);
});
