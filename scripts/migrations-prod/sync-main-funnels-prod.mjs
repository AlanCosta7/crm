/**
 * sync-main-funnels-prod.mjs — Traz os funis "main" (jornada completa) da
 * homologação para PRODUÇÃO.
 *
 * Contexto: produção nunca recebeu os funis `wizmart` e `smart_cafe`
 * (type: 'main') que foram desenhados e validados em homologação — o v3
 * unifica a jornada BDR → SDR → Rep num único funil por produto, e
 * `visibleFunnelTypes()` (src/utils/funnelUtils.ts) já assume que TODO papel
 * enxerga o tipo 'main'. Sem esses dois docs, cada perfil só via fragmentos
 * (inbound OU outbound OU hunter) — nunca o fluxo inteiro.
 *
 * O que este script faz (tudo ADITIVO, com `{ merge: true }`):
 *   1. Cria `tenants/{tid}/funnels/wizmart`   (14 estágios, Lista Potencial → Inaugurado/Perdeu)
 *   2. Cria `tenants/{tid}/funnels/smart_cafe` (10 estágios, Lista Potencial → Instalação/Perdeu)
 *   3. Completa `tenants/{tid}/stages` (coleção legada v1, só id+name) com os
 *      rótulos que esses estágios novos precisam para exibir nome amigável
 *      em telas que ainda leem essa coleção plana.
 *
 * O que este script NÃO faz — de propósito:
 *   - Não toca nos funis inbound-, outbound- e hunter- já existentes.
 *   - Não move nenhum deal entre funis. Deals hoje presos em funis
 *     fragmentados continuam onde estão até uma decisão explícita.
 *   - Não apaga nada.
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin (ADC):
 *    gcloud auth application-default login
 *
 * Uso:
 *   node scripts/migrations-prod/sync-main-funnels-prod.mjs             # aplica
 *   node scripts/migrations-prod/sync-main-funnels-prod.mjs --dry-run    # só mostra o que faria
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId = process.env.TENANT_ID || 'wizmart';

delete process.env.FIRESTORE_EMULATOR_HOST;

const app = admin.initializeApp({ projectId }, `sync-${Date.now()}`);
const db = app.firestore();
const base = `tenants/${tenantId}`;
const TS = admin.firestore.FieldValue.serverTimestamp;

// ── Funil main — WizMart (copiado de homolog: codifyx7/wizmart_sp/funnels/wizmart) ──
const wizmartFunnel = {
  type: 'main',
  productId: 'wizmart',
  name: 'WizMart',
  color: '#1A6B1A',
  isActive: true,
  stages: [
    { id: 'lista_potencial',        name: 'Lista Potencial',        order: 1,  coinsOnEnter: 0, slaBusinessDays: 2,  isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
    { id: 'prospeccao',             name: 'Prospecção',             order: 2,  coinsOnEnter: 0, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#D8EDD8' },
    { id: 'conectado',              name: 'Conectado',              order: 3,  coinsOnEnter: 1, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#BAD4BA', hasConnectionSubtype: false },
    // Fase 1.1 do PLANO_DESENHO_CRM.md (slide 1) — só no WizMart; o Alan
    // confirmou em 10/09/2026 que o Smart Café não precisa das etapas de
    // reunião (lá o porte do cliente já decide o caminho, via connectionType).
    // SLA de 3 dias úteis, igual às outras etapas de SDR (confirmado no mesmo dia).
    { id: 'reuniao_agendada',       name: 'Reunião Agendada',       order: 4,  coinsOnEnter: 1, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#ACCBA0' },
    { id: 'reuniao_realizada',      name: 'Reunião Realizada',      order: 5,  coinsOnEnter: 2, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#9DC080' },
    { id: 'visita_agendada',        name: 'Visita Agendada',        order: 6,  coinsOnEnter: 1, slaBusinessDays: 5,  isHandoffRequired: true,  defaultTemplateIds: [], color: '#8DB600' },
    { id: 'visita_realizada',       name: 'Visita Realizada',       order: 7,  coinsOnEnter: 2, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#6DA000' },
    { id: 'proposta_apresentada',   name: 'Proposta Apresentada',   order: 8,  coinsOnEnter: 1, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#5A8A00' },
    { id: 'negociacao_contratual',  name: 'Negociação Contratual',  order: 9,  coinsOnEnter: 0, slaBusinessDays: 10, isHandoffRequired: false, defaultTemplateIds: [], color: '#3D6B00' },
    { id: 'contrato_assinado',      name: 'Contrato Assinado',      order: 10, coinsOnEnter: 2, slaBusinessDays: 7,  isHandoffRequired: false, defaultTemplateIds: [], color: '#2A5000' },
    { id: 'instalacao_agendada',    name: 'Instalação Agendada',    order: 11, coinsOnEnter: 1, slaBusinessDays: 5,  isHandoffRequired: false, defaultTemplateIds: [], color: '#1A3E00' },
    { id: 'instalacao_realizada',   name: 'Instalação Realizada',   order: 12, coinsOnEnter: 2, slaBusinessDays: 3,  isHandoffRequired: false, defaultTemplateIds: [], color: '#122D00' },
    { id: 'inaugurado',             name: 'Inaugurado',             order: 13, coinsOnEnter: 5, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#0D2800' },
    { id: 'perdeu',                 name: 'Perdeu',                 order: 14, coinsOnEnter: 0, slaBusinessDays: 0,  isHandoffRequired: false, defaultTemplateIds: [], color: '#4B1113', isLost: true },
  ],
};

// ── Funil main — Smart Café (copiado de homolog) ──────────────────────────────
const smartCafeFunnel = {
  type: 'main',
  productId: 'smart_cafe',
  name: 'Smart Café',
  color: '#5E3A26',
  isActive: true,
  stages: [
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
  ],
};

// ── Rótulos que faltam na coleção legada `stages` (v1, só id+name) ───────────
const missingLegacyStages = {
  lista_potencial:       'Lista Potencial',
  prospeccao:            'Prospecção',
  conectado:              'Conectado',
  visita_agendada:        'Visita Agendada',
  visita_realizada:       'Visita Realizada',
  proposta_apresentada:   'Proposta Apresentada',
  negociacao_contratual:  'Negociação Contratual',
  contrato_assinado:      'Contrato Assinado',
  instalacao_agendada:    'Instalação Agendada',
  instalacao_realizada:   'Instalação Realizada',
  inaugurado:              'Inaugurado',
  perdeu:                  'Perdeu',
  degustacao_agendada:    'Degustação Agendada',
  degustacao_realizada:   'Degustação Realizada',
  reuniao_agendada:       'Reunião Agendada',
  reuniao_realizada:      'Reunião Realizada',
};

async function main() {
  console.log(`\n[sync-main-funnels] projeto=${projectId} tenant=${tenantId} dryRun=${DRY_RUN}\n`);

  const existingFunnels = await db.collection(`${base}/funnels`).get();
  const existingIds = new Set(existingFunnels.docs.map(d => d.id));

  for (const [id, funnel] of [['wizmart', wizmartFunnel], ['smart_cafe', smartCafeFunnel]]) {
    const already = existingIds.has(id);
    console.log(`funnels/${id}: ${already ? 'já existe — será mesclado (merge), estágios sobrescritos com a versão de homolog' : 'será criado'} (${funnel.stages.length} estágios)`);
    if (!DRY_RUN) {
      await db.doc(`${base}/funnels/${id}`).set({ ...funnel, createdAt: TS(), syncedFromHomologAt: TS() }, { merge: true });
    }
  }

  const existingStages = await db.collection(`${base}/stages`).get();
  const existingStageIds = new Set(existingStages.docs.map(d => d.id));
  const toAdd = Object.entries(missingLegacyStages).filter(([id]) => !existingStageIds.has(id));

  console.log(`\nstages (legado): ${toAdd.length} rótulo(s) novo(s) a adicionar de ${Object.keys(missingLegacyStages).length} total`);
  for (const [id, name] of toAdd) {
    console.log(`  + ${id} -> "${name}"`);
    if (!DRY_RUN) {
      await db.doc(`${base}/stages/${id}`).set({ name, createdAt: TS() }, { merge: true });
    }
  }

  console.log(DRY_RUN ? '\n[dry-run] nada foi escrito.' : '\n✔ Concluído.');
  process.exit(0);
}

main().catch(err => {
  console.error('[sync-main-funnels] falhou:', err);
  process.exit(1);
});
