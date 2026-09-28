/**
 * Seed PRODUÇÃO — dados de demonstração para testar telas vazias.
 *
 * Popula casos de teste em PRODUÇÃO (projeto codifyx7) para validar:
 *   • Comissão (negócios ativados + assinaturas + tier do SDR)
 *   • Cadência de hoje (fila do SDR)
 *   • Handoffs (SDR → Rep)
 *   • Projetos de Layout / Fila de Projetos (project_requests)
 *
 * Todos os documentos usam IDs com prefixo "demo-" para identificação e remoção
 * fáceis. É idempotente (merge). Use --purge para apagar tudo o que ele criou.
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin:
 *    gcloud auth application-default login    (ou GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Configuração por variáveis de ambiente (referenciam usuários REAIS do tenant):
 *   TENANT_ID    (obrigatório) — id do tenant em produção
 *   BDR_UID      (obrigatório) — uid do usuário BDR
 *   SDR_UID      (obrigatório) — uid do usuário SDR (verá a Cadência de hoje)
 *   REP_UID      (obrigatório) — uid do usuário Rep (verá os Handoffs)
 *   DESIGN_UID   (opcional)    — uid do designer (Fila de Projetos)
 *   SDR_TIER     (opcional)    — junior | pleno | senior  (default: pleno)
 *   BDR_NAME / SDR_NAME / REP_NAME (opcionais) — nomes para exibição
 *
 * Uso:
 *   TENANT_ID=xxx BDR_UID=.. SDR_UID=.. REP_UID=.. node scripts/seed/seed-prod-demo.mjs
 *   ... node scripts/seed/seed-prod-demo.mjs --purge
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const PURGE = process.argv.includes('--purge');

// ── Configuração ────────────────────────────────────────────────────────────────
const cfg = {
  projectId: process.env.GCLOUD_PROJECT || 'codifyx7',
  tenantId:  process.env.TENANT_ID,
  bdr:    { uid: process.env.BDR_UID,    name: process.env.BDR_NAME || 'BDR Demo' },
  sdr:    { uid: process.env.SDR_UID,    name: process.env.SDR_NAME || 'SDR Demo', tier: process.env.SDR_TIER || 'pleno' },
  rep:    { uid: process.env.REP_UID,    name: process.env.REP_NAME || 'Rep Demo' },
  design: { uid: process.env.DESIGN_UID, name: 'Designer Demo' },
};

const faltando = ['tenantId', 'bdr.uid', 'sdr.uid', 'rep.uid'].filter((p) => {
  const v = p.includes('.') ? cfg[p.split('.')[0]][p.split('.')[1]] : cfg[p];
  return !v;
});
if (faltando.length) {
  console.error(`\n✗ Variáveis obrigatórias ausentes: ${faltando.join(', ')}`);
  console.error('  Ex.: TENANT_ID=meu_tenant BDR_UID=.. SDR_UID=.. REP_UID=.. node scripts/seed/seed-prod-demo.mjs\n');
  process.exit(1);
}

admin.initializeApp({ projectId: cfg.projectId, credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;
const base = `tenants/${cfg.tenantId}`;
const col = (name) => db.collection(`${base}/${name}`);

// Data de hoje em America/Sao_Paulo (YYYY-MM-DD) p/ a Cadência.
function hojeBRT() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date()); // 'YYYY-MM-DD'
}
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
function isoDaysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); }

const HOJE = hojeBRT();

// ── Dados de demonstração ───────────────────────────────────────────────────────

// Negócios ativados (aparecem na Calculadora de Comissão) + em fila (Cadência)
const deals = [
  { id: 'demo-deal-com1', name: '[DEMO] Minimercado Praça Central', company: '[DEMO] Praça Central Ltda',
    stage: 'inaugurado', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    status: 'won', owner: cfg.rep.uid, bdrId: cfg.bdr.uid, assignedSdrId: cfg.sdr.uid, assignedRepId: cfg.rep.uid,
    cohortKeys: { conquestMonth: HOJE.slice(0, 7) } },
  { id: 'demo-deal-com2', name: '[DEMO] Comodato Indústria Demo', company: '[DEMO] Indústria Demo SA',
    stage: 'instalacao_realizada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    status: 'won', owner: cfg.rep.uid, bdrId: cfg.bdr.uid, assignedSdrId: cfg.sdr.uid, assignedRepId: cfg.rep.uid },
  // Em fila do BDR (alimenta a Cadência)
  { id: 'demo-deal-q1', name: '[DEMO] Padaria Bairro', company: '[DEMO] Padaria Bairro ME',
    stage: 'lista_potencial', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    status: 'in_queue', owner: cfg.sdr.uid, bdrId: cfg.bdr.uid, assignedSdrId: cfg.sdr.uid },
  { id: 'demo-deal-q2', name: '[DEMO] Mercearia Esquina', company: '[DEMO] Mercearia Esquina ME',
    stage: 'lista_potencial', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    status: 'in_queue', owner: cfg.sdr.uid, bdrId: cfg.bdr.uid, assignedSdrId: cfg.sdr.uid },
];

// Fila de Cadência de hoje (cadence_queues/{sdrId}/daily/{hoje})
function cadenceActivities() {
  const mk = (type) => ({ type, status: 'pending' });
  return { email: mk('email'), linkedin: mk('linkedin'), whatsapp: mk('whatsapp'), call: mk('call') };
}
const dailyQueue = {
  sdrId: cfg.sdr.uid, date: HOJE,
  cardsDistributed: 2, previousCompletionRate: 1, activitiesRequired: 8, activitiesCompleted: 0, completionRate: 0,
  cards: [
    { dealId: 'demo-deal-q1', contactName: '[DEMO] José Padeiro', companyName: '[DEMO] Padaria Bairro ME', productId: 'wizmart', isNew: true, activities: cadenceActivities() },
    { dealId: 'demo-deal-q2', contactName: '[DEMO] Ana Mercearia', companyName: '[DEMO] Mercearia Esquina ME', productId: 'wizmart', isNew: true, activities: cadenceActivities() },
  ],
};

// Handoffs (SDR → Rep). O Rep logado vê em "Handoffs".
const handoffs = [
  // ── Pendentes (aba padrão ao abrir a tela)
  { id: 'demo-handoff-1', dealId: 'demo-deal-com1', productId: 'wizmart',
    fromSdrId: cfg.sdr.uid, toRepId: cfg.rep.uid,
    priorityChannel: 'whatsapp', visitType: 'presential',
    visitScheduledAt: isoDaysFromNow(2),
    notes: '[DEMO] Cliente quente, prefere contato à tarde. Tem espaço para minimercado de até 4 gôndolas.',
    status: 'pending_rep_acceptance' },
  { id: 'demo-handoff-3', dealId: 'demo-deal-q1', productId: 'wizmart',
    fromSdrId: cfg.sdr.uid, toRepId: cfg.rep.uid,
    priorityChannel: 'call', visitType: 'presential',
    visitScheduledAt: isoDaysFromNow(4),
    notes: '[DEMO] Proprietário confirmou interesse por videoconferência. Aguarda proposta comercial.',
    status: 'pending_rep_acceptance' },
  // ── Aceitos
  { id: 'demo-handoff-2', dealId: 'demo-deal-com2', productId: 'smart_cafe',
    fromSdrId: cfg.sdr.uid, toRepId: cfg.rep.uid,
    priorityChannel: 'email', visitType: 'video',
    visitScheduledAt: isoDaysFromNow(1),
    notes: '[DEMO] Reunião de fechamento agendada. Decisor é o gerente de RH.',
    status: 'accepted', acceptedAt: isoDaysAgo(1) },
  { id: 'demo-handoff-4', dealId: 'demo-deal-q2', productId: 'wizmart',
    fromSdrId: cfg.sdr.uid, toRepId: cfg.rep.uid,
    priorityChannel: 'whatsapp', visitType: 'presential',
    visitScheduledAt: isoDaysAgo(3),
    notes: '[DEMO] Visita já realizada. Contrato em elaboração.',
    status: 'accepted', acceptedAt: isoDaysAgo(5) },
  // ── Recusado (histórico)
  { id: 'demo-handoff-5', dealId: 'demo-deal-com1', productId: 'wizmart',
    fromSdrId: cfg.sdr.uid, toRepId: cfg.rep.uid,
    priorityChannel: 'call', visitType: 'presential',
    visitScheduledAt: isoDaysAgo(10),
    notes: '[DEMO] Lead fora da área de cobertura do representante.',
    status: 'declined', declinedReason: '[DEMO] Fora do meu território. Favor reatribuir para a região Sul.' },
];

// Projetos de Layout / Fila de Projetos (project_requests)
const projectRequests = [
  { id: 'demo-proj-1', dealId: 'demo-deal-com1', companyName: '[DEMO] Praça Central Ltda',
    requestedBy: cfg.rep.uid, requestedByName: cfg.rep.name, requestedByRole: 'rep',
    pdvTypes: ['micromarket'], quantities: { gondola: 4, fridge: 2, freezerVertical: 1, freezerHorizontal: 0, luminary: 2, sign: 1 },
    walls: { wall1: '4,50m x 2,80m', wall2: '3,20m x 2,80m', wall3: '' },
    notes: '[DEMO] Tons verdes, sem janelas na frontal.', mediaUrls: [], status: 'pending',
    assignedToDesignerId: null, deliveredFileUrl: null, requestedAt: isoDaysAgo(2) },
  { id: 'demo-proj-2', dealId: 'demo-deal-com2', companyName: '[DEMO] Indústria Demo SA',
    requestedBy: cfg.sdr.uid, requestedByName: cfg.sdr.name, requestedByRole: 'sdr',
    pdvTypes: ['container'], quantities: { gondola: 6, fridge: 3, freezerVertical: 2, freezerHorizontal: 1, luminary: 4, sign: 2 },
    walls: { wall1: '6,00m x 3,00m', wall2: '4,00m x 3,00m', wall3: '' },
    notes: '[DEMO] Container externo, sinalização obrigatória.', mediaUrls: [],
    status: cfg.design.uid ? 'in_progress' : 'pending',
    assignedToDesignerId: cfg.design.uid || null, deliveredFileUrl: null, requestedAt: isoDaysAgo(4) },
];

// ── Escrita / Remoção ───────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${PURGE ? 'PURGE' : 'SEED'} produção — projeto ${cfg.projectId}, tenant ${cfg.tenantId}\n`);

  if (PURGE) {
    const alvos = [
      ...deals.map(d => col('deals').doc(d.id)),
      ...handoffs.map(h => col('handoffs').doc(h.id)),
      ...projectRequests.map(p => col('project_requests').doc(p.id)),
      col('cadence_queues').doc(cfg.sdr.uid).collection('daily').doc(HOJE),
    ];
    const batch = db.batch();
    alvos.forEach(ref => batch.delete(ref));
    await batch.commit();
    console.log(`  • ${alvos.length} documentos demo removidos.`);
    console.log('  • commissionTier do SDR NÃO foi alterado (remova manualmente se desejar).');
    console.log('\n✓ Purge concluído.\n');
    return;
  }

  const batch = db.batch();

  // tier do SDR (merge — não apaga o resto do cadastro)
  batch.set(col('users').doc(cfg.sdr.uid), { commissionTier: cfg.sdr.tier }, { merge: true });

  for (const d of deals)           batch.set(col('deals').doc(d.id), { ...d, createdAt: TS(), updatedAt: TS() }, { merge: true });
  for (const h of handoffs)        batch.set(col('handoffs').doc(h.id), { ...h, createdAt: TS() }, { merge: true });
  for (const p of projectRequests) batch.set(col('project_requests').doc(p.id), { ...p, createdAt: TS() }, { merge: true });

  batch.set(col('cadence_queues').doc(cfg.sdr.uid).collection('daily').doc(HOJE),
    { ...dailyQueue, generatedAt: TS() }, { merge: true });

  await batch.commit();

  console.log(`  • SDR tier: ${cfg.sdr.tier}`);
  console.log(`  • ${deals.length} negócios (2 ativados p/ comissão, 2 em fila p/ cadência)`);
  console.log(`  • Cadência de hoje (${HOJE}): ${dailyQueue.cards.length} cards p/ SDR ${cfg.sdr.uid}`);
  console.log(`  • ${handoffs.length} handoffs p/ Rep ${cfg.rep.uid} (2 pendentes, 2 aceitos, 1 recusado)`);
  console.log(`  • ${projectRequests.length} projetos de layout${cfg.design.uid ? ' (1 atribuído ao designer)' : ''}`);
  console.log('\n✓ Seed de produção concluído. Tudo prefixado com "demo-"/"[DEMO]" — use --purge para remover.\n');
}

run().catch((e) => { console.error('Falha no seed de produção:', e); process.exit(1); });
