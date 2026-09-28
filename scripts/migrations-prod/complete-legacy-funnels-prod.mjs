/**
 * complete-legacy-funnels-prod.mjs — Estende os 6 funis legados
 * (inbound-, outbound- e hunter-) em PRODUÇÃO para a jornada completa,
 * igual ao que já foi feito no funil `main` e no "BDR - Outbound".
 *
 * Motivo: cada um desses 6 funis tinha só 3-10 etapas, parava em "Visita
 * Agendada"/"Agendamento" (o handoff SDR→Rep) sem seguir até fechamento, e
 * dois tinham bugs de dados reais — `inbound-smart_cafe` com duas etapas no
 * mesmo `order: 3`, `inbound-wizmart` começando em `order: 2` sem etapa 1.
 * Nenhum tinha etapa de perda ("Perdeu").
 *
 * Verificado antes de escrever: os 6 funis têm ZERO deals em produção
 * (auditoria de 01/09/2026) — substituir o array `stages` inteiro é seguro,
 * não há nenhum card cujo `stage` atual deixaria de existir.
 *
 * O que este script faz: substitui o `stages` de cada um dos 6 funis pela
 * MESMA lista completa do funil `main` do produto correspondente (12 etapas
 * para wizmart, 10 para smart_cafe) — a fonte já usada em
 * sync-main-funnels-prod.mjs e complete-bdr-outbound-funnel-prod.mjs.
 * `name`, `type`, `productId`, `color`, `isActive` de cada funil são
 * preservados como estão.
 *
 * O que NÃO faz: não toca em `wizmart`, `smart_cafe` (main) nem
 * `C5qobLwI26sa2lDuHVA0` (BDR - Outbound) — já completos. Não move deals
 * (não há nenhum para mover nestes 6).
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin (ADC):
 *    gcloud auth application-default login
 *
 * Uso:
 *   node scripts/migrations-prod/complete-legacy-funnels-prod.mjs             # aplica
 *   node scripts/migrations-prod/complete-legacy-funnels-prod.mjs --dry-run    # só mostra
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId = process.env.TENANT_ID || 'wizmart';

delete process.env.FIRESTORE_EMULATOR_HOST;

const app = admin.initializeApp({ projectId }, `complete-legacy-${Date.now()}`);
const db = app.firestore();
const base = `tenants/${tenantId}`;

// Idêntico ao funil `wizmart` (main) — mesma fonte usada nos scripts anteriores.
const wizmartStages = [
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

// Idêntico ao funil `smart_cafe` (main).
const smartCafeStages = [
  { id: 'lista_potencial',       name: 'Lista Potencial',            order: 1,  coinsOnEnter: 0, slaBusinessDays: 2,  isHandoffRequired: false, defaultTemplateIds: [], color: '#FAF2EC' },
  { id: 'prospeccao',            name: 'Prospecção',                 order: 2,  coinsOnEnter: 0, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#F5E6D8' },
  { id: 'conectado',             name: 'Conectado ao Representante', order: 3,  coinsOnEnter: 1, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#EADFD9', hasConnectionSubtype: true },
  { id: 'proposta_apresentada',  name: 'Proposta Apresentada',       order: 4,  coinsOnEnter: 1, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#E8CDB0' },
  { id: 'degustacao_agendada',   name: 'Degustação Agendada',        order: 5,  coinsOnEnter: 1, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#D4A373' },
  { id: 'degustacao_realizada',  name: 'Degustação Realizada',       order: 6,  coinsOnEnter: 2, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#C8925D' },
  { id: 'negociacao_contratual', name: 'Negociação Contratual',      order: 7,  coinsOnEnter: 0, slaBusinessDays: 10, isHandoffRequired: false, defaultTemplateIds: [], color: '#9E5E30' },
  { id: 'contrato_assinado',     name: 'Contrato Assinado',          order: 8,  coinsOnEnter: 2, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#7E4820' },
  { id: 'instalacao_realizada',  name: 'Instalação Realizada',       order: 9,  coinsOnEnter: 5, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#3B2015' },
  { id: 'perdeu',                name: 'Perdeu',                     order: 10, coinsOnEnter: 0, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#4B1113', isLost: true },
];

const TARGETS = [
  { id: 'outbound-wizmart', stages: wizmartStages },
  { id: 'hunter-wizmart', stages: wizmartStages },
  { id: 'inbound-wizmart', stages: wizmartStages },
  { id: 'outbound-smart_cafe', stages: smartCafeStages },
  { id: 'hunter-smart_cafe', stages: smartCafeStages },
  { id: 'inbound-smart_cafe', stages: smartCafeStages },
];

async function main() {
  console.log(`\n[complete-legacy-funnels] projeto=${projectId} tenant=${tenantId} dryRun=${DRY_RUN}\n`);

  for (const { id, stages } of TARGETS) {
    const ref = db.doc(`${base}/funnels/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`⚠ funnels/${id} não existe — pulando.`);
      continue;
    }
    const before = snap.data();

    const dealsHere = await db.collection(`${base}/deals`).where('funnelId', '==', id).get();
    if (!dealsHere.empty) {
      console.log(`⚠ funnels/${id} tem ${dealsHere.size} deal(s) — PULANDO por segurança (esperado 0).`);
      dealsHere.forEach(d => console.log(`    "${d.data().name}" [${d.id}] stage=${d.data().stage}`));
      continue;
    }

    console.log(`funnels/${id} "${before.name}" (${before.type}/${before.productId})`);
    console.log(`  hoje: ${before.stages?.length ?? 0} etapa(s) -> depois: ${stages.length} etapa(s)`);
    console.log(`  ${stages.map(s => s.name).join(' -> ')}\n`);

    if (!DRY_RUN) {
      await ref.update({ stages });
    }
  }

  console.log(DRY_RUN ? '[dry-run] nada foi escrito.' : '✔ Concluído.');
  process.exit(0);
}

main().catch(err => {
  console.error('[complete-legacy-funnels] falhou:', err);
  process.exit(1);
});
