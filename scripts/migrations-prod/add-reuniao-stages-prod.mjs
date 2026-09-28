/**
 * add-reuniao-stages-prod.mjs — Insere "Reunião Agendada" e "Reunião Realizada"
 * no funil WizMart. Fase 1.1 do PLANO_DESENHO_CRM.md (slide 1 do deck).
 *
 * Onde entram: entre `conectado` e `visita_agendada`, nas ordens 4 e 5, com SLA
 * de 3 dias úteis (igual às outras etapas de SDR — confirmado com o Alan em
 * 10/09/2026). Todas as etapas seguintes são reordenadas (+2).
 *
 * SÓ NO WIZMART. O Alan confirmou que o Smart Café não precisa: lá o porte do
 * cliente já decide o caminho pelo `connectionType`.
 *
 * O que este script NÃO faz, de propósito:
 *   - Não move nenhum deal. Cards existentes ficam onde estão; as duas colunas
 *     novas nascem vazias e passam a ser usadas dali pra frente.
 *   - Não mexe no funil Smart Café.
 *   - Não apaga etapa nenhuma.
 *
 * IDEMPOTENTE: se as duas etapas já existem, não reescreve nada.
 *
 * Dry-run por padrão.
 *
 * Uso:
 *   node scripts/migrations-prod/add-reuniao-stages-prod.mjs                    # dry-run
 *   node scripts/migrations-prod/add-reuniao-stages-prod.mjs --apply
 *   node scripts/migrations-prod/add-reuniao-stages-prod.mjs --apply --emulator
 *
 * Em produção requer ADC: gcloud auth application-default login
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const APPLY = process.argv.includes('--apply');
const EMULADOR = process.argv.includes('--emulator');
const projectId = process.env.GCLOUD_PROJECT || (EMULADOR ? 'demo-wizmart-crm-local' : 'wizmart-crm');
const tenantId = process.env.TENANT_ID || 'wizmart';

if (EMULADOR) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const app = admin.initializeApp({ projectId }, `reuniao-${Date.now()}`);
const db = app.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;

const NOVAS = [
  { id: 'reuniao_agendada',  name: 'Reunião Agendada',  coinsOnEnter: 1, slaBusinessDays: 3, isHandoffRequired: false, defaultTemplateIds: [], color: '#ACCBA0' },
  { id: 'reuniao_realizada', name: 'Reunião Realizada', coinsOnEnter: 2, slaBusinessDays: 3, isHandoffRequired: false, defaultTemplateIds: [], color: '#9DC080' },
];

/** Insere as duas etapas depois de `conectado` e renumera tudo sequencialmente. */
function montarEtapas(atuais) {
  const semNovas = atuais.filter(s => !NOVAS.some(n => n.id === s.id));
  const ordenadas = [...semNovas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const idxConectado = ordenadas.findIndex(s => s.id === 'conectado');
  if (idxConectado === -1) return null; // funil fora do formato esperado

  const resultado = [
    ...ordenadas.slice(0, idxConectado + 1),
    ...NOVAS,
    ...ordenadas.slice(idxConectado + 1),
  ];
  // Renumera do zero: mais seguro que somar +2, que erra se a ordem original
  // tiver buracos ou duplicatas.
  return resultado.map((s, i) => ({ ...s, order: i + 1 }));
}

const ref = db.doc(`tenants/${tenantId}/funnels/wizmart`);
const snap = await ref.get();

if (!snap.exists) {
  console.error(`🔴 tenants/${tenantId}/funnels/wizmart não existe. Rode antes: node scripts/migrations-prod/sync-main-funnels-prod.mjs --apply`);
  process.exit(1);
}

const atuais = snap.data().stages ?? [];
const jaTem = NOVAS.every(n => atuais.some(s => s.id === n.id));

console.log(`\n[add-reuniao-stages] projeto=${projectId} tenant=${tenantId} apply=${APPLY}\n`);
console.log(`funil wizmart: ${atuais.length} etapa(s) hoje`);

if (jaTem) {
  console.log('✅ As duas etapas de reunião já existem — nada a fazer.');
  process.exit(0);
}

const novas = montarEtapas(atuais);
if (!novas) {
  console.error("🔴 Não encontrei a etapa 'conectado' no funil. Abortando para não reordenar às cegas.");
  process.exit(1);
}

console.log('\nordem resultante:');
for (const s of novas) {
  const marca = NOVAS.some(n => n.id === s.id) ? ' ← NOVA' : '';
  console.log(`  ${String(s.order).padStart(2)}. ${s.name}${marca}`);
}

// Conferência: nenhuma etapa existente pode desaparecer na renumeração.
const perdidas = atuais.filter(a => !novas.some(n => n.id === a.id));
if (perdidas.length > 0) {
  console.error(`\n🔴 ${perdidas.length} etapa(s) desapareceriam: ${perdidas.map(p => p.id).join(', ')}. Abortando.`);
  process.exit(1);
}

const deals = await db.collection(`tenants/${tenantId}/deals`).get();
const porEtapa = {};
deals.docs.forEach(d => { const st = d.data().stage; porEtapa[st] = (porEtapa[st] ?? 0) + 1; });
console.log(`\ndeals por etapa hoje (nenhum será movido): ${JSON.stringify(porEtapa)}`);

if (!APPLY) {
  console.log('\n[dry-run] nada foi escrito. Rode com --apply para aplicar.');
  process.exit(0);
}

await ref.set({ stages: novas, updatedAt: TS() }, { merge: true });

// Rótulos na coleção legada `stages` (v1, só id+name), usada por telas antigas.
for (const n of NOVAS) {
  await db.doc(`tenants/${tenantId}/stages/${n.id}`).set({ name: n.name, createdAt: TS() }, { merge: true });
}

console.log('\n✔ Etapas de reunião adicionadas ao funil WizMart.');
process.exit(0);
