/**
 * test-reuniao-stages-emulator.mjs — Valida `add-reuniao-stages-prod.mjs`.
 *
 * Roda sem o emulador de functions: o script de migração mexe só no documento
 * do funil, e nenhum trigger escuta `funnels`.
 *
 * Uso: npm run test:reuniao
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const ref = db.doc(`tenants/${TENANT}/funnels/wizmart`);

// Funil como está em produção HOJE: 12 etapas, sem reunião.
const ANTES = [
  { id: 'lista_potencial',        name: 'Lista Potencial',        order: 1,  slaBusinessDays: 2 },
  { id: 'prospeccao',             name: 'Prospecção',             order: 2,  slaBusinessDays: 3 },
  { id: 'conectado',              name: 'Conectado',              order: 3,  slaBusinessDays: 3 },
  { id: 'visita_agendada',        name: 'Visita Agendada',        order: 4,  slaBusinessDays: 5, isHandoffRequired: true },
  { id: 'visita_realizada',       name: 'Visita Realizada',       order: 5,  slaBusinessDays: 5 },
  { id: 'proposta_apresentada',   name: 'Proposta Apresentada',   order: 6,  slaBusinessDays: 7 },
  { id: 'negociacao_contratual',  name: 'Negociação Contratual',  order: 7,  slaBusinessDays: 10 },
  { id: 'contrato_assinado',      name: 'Contrato Assinado',      order: 8,  slaBusinessDays: 7 },
  { id: 'instalacao_agendada',    name: 'Instalação Agendada',    order: 9,  slaBusinessDays: 5 },
  { id: 'instalacao_realizada',   name: 'Instalação Realizada',   order: 10, slaBusinessDays: 3 },
  { id: 'inaugurado',             name: 'Inaugurado',             order: 11, slaBusinessDays: 0 },
  { id: 'perdeu',                 name: 'Perdeu',                 order: 12, slaBusinessDays: 0, isLost: true },
];

const run = (...args) => execFileSync('node', ['scripts/migrations-prod/add-reuniao-stages-prod.mjs', ...args], {
  encoding: 'utf8', env: { ...process.env, TENANT_ID: TENANT, GCLOUD_PROJECT: PROJECT },
});

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function resetar(stages = ANTES) {
  await ref.set({ type: 'main', productId: 'wizmart', name: 'WizMart', isActive: true, stages });
}

async function etapas() {
  return ((await ref.get()).data().stages ?? []).sort((a, b) => a.order - b.order);
}

// ── Dry-run não escreve ───────────────────────────────────────────────────────
await resetar();
const saidaDry = run('--emulator');
report((await etapas()).length === 12 && saidaDry.includes('dry-run'),
  'dry-run não altera o funil', `${(await etapas()).length} etapas`);

// ── Aplicando ─────────────────────────────────────────────────────────────────
run('--apply', '--emulator');
const depois = await etapas();

report(depois.length === 14, 'funil passa a ter 14 etapas', `${depois.length}`);
report(depois[3].id === 'reuniao_agendada' && depois[3].order === 4,
  'Reunião Agendada entra na posição 4', `${depois[3].id}@${depois[3].order}`);
report(depois[4].id === 'reuniao_realizada' && depois[4].order === 5,
  'Reunião Realizada entra na posição 5', `${depois[4].id}@${depois[4].order}`);
report(depois[3].slaBusinessDays === 3 && depois[4].slaBusinessDays === 3,
  'SLA das duas é 3 dias úteis (decisão do Alan)');
report(depois[2].id === 'conectado', 'Conectado continua na 3');
report(depois[5].id === 'visita_agendada' && depois[5].order === 6,
  'Visita Agendada foi empurrada para a 6', `@${depois[5].order}`);
report(depois[5].isHandoffRequired === true,
  'Visita Agendada preserva o handoff obrigatório na renumeração');
report(depois[13].id === 'perdeu' && depois[13].isLost === true,
  'Perdeu continua por último e ainda é etapa de perda', `@${depois[13].order}`);

// Nenhuma etapa original pode ter desaparecido.
const faltando = ANTES.filter(a => !depois.some(d => d.id === a.id));
report(faltando.length === 0, 'nenhuma etapa original foi perdida',
  faltando.length ? faltando.map(f => f.id).join(',') : 'todas presentes');

// Ordens sequenciais, sem buraco nem duplicata.
const ordens = depois.map(s => s.order);
report(JSON.stringify(ordens) === JSON.stringify([...Array(14)].map((_, i) => i + 1)),
  'ordens ficam sequenciais de 1 a 14');

// Rótulos legados gravados.
const legado = await db.doc(`tenants/${TENANT}/stages/reuniao_agendada`).get();
report(legado.exists && legado.data().name === 'Reunião Agendada',
  'rótulo gravado na coleção legada `stages`');

// ── Idempotência ──────────────────────────────────────────────────────────────
const saida2 = run('--apply', '--emulator');
report(saida2.includes('já existem'), 'rodar de novo não faz nada (idempotente)');
report((await etapas()).length === 14, 'e não duplica etapa');

// ── Funil fora do formato: aborta em vez de reordenar às cegas ────────────────
await resetar([{ id: 'qualquer', name: 'Qualquer', order: 1 }]);
let abortou = false;
try { run('--apply', '--emulator'); } catch { abortou = true; }
report(abortou && (await etapas()).length === 1,
  "funil sem 'conectado' aborta sem tocar em nada");

console.log(allOk ? '\n🎉 Fase 1.1 validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
