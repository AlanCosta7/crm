/**
 * seed-prod-bootstrap.mjs — Bootstrap de PRODUÇÃO (projeto wizmart-crm)
 *
 * Popula SOMENTE a estrutura essencial para o cliente operar — SEM dados mockados:
 *   • Usuário admin master (Auth + custom claims + doc no Firestore)
 *   • Funis v2 (6) + estágios legados (compat. v1)
 *   • Templates de playbook (2)
 *   • Catálogo inicial da loja de prêmios (editável pelo admin)
 *   • Definições de conquistas (badges)
 *   • Documento raiz do tenant + nós base do Realtime Database (vazios/zerados)
 *
 * NÃO cria: deals, contatos, empresas, atividades, handoffs, vendedores fictícios.
 *
 * ⚠️ ESCREVE EM PRODUÇÃO. Requer credenciais de admin (ADC):
 *    gcloud auth application-default login   (ou GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Variáveis de ambiente:
 *   GCLOUD_PROJECT   (default: wizmart-crm)
 *   TENANT_ID        (default: wizmart)
 *   ADMIN_EMAIL      (default: fernando.ecard@wizmart.com.br)
 *   ADMIN_NAME       (default: Fernando)
 *   ADMIN_PASSWORD   (opcional) — se omitido, gera senha temporária + link de redefinição
 *
 * Uso:
 *   GCLOUD_PROJECT=wizmart-crm node scripts/seed/seed-prod-bootstrap.mjs
 */

import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId  = process.env.TENANT_ID || 'wizmart';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'fernando.ecard@wizmart.com.br';
const ADMIN_NAME  = process.env.ADMIN_NAME  || 'Fernando';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || `Wiz!${randomBytes(6).toString('base64url')}`;

// Garante que NÃO usaremos emuladores acidentalmente
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;

const app  = admin.initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` });
const db   = app.firestore();
const auth = app.auth();
const rtdb = app.database();
const TS   = admin.firestore.FieldValue.serverTimestamp;

const PRODUCT_IDS = ['wizmart', 'smart_cafe'];

// ── Funis v2 ──────────────────────────────────────────────────────────────────
const funnels = [
  { id: 'inbound-wizmart',  name: 'Inbound — WizMart',  type: 'inbound',  productId: 'wizmart', color: '#1A6B1A', isActive: true, stages: [
    { id: 'lead_recebido',        name: 'Lead Recebido',        order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#E5F0E5' },
    { id: 'qualif_sdr',           name: 'Qualificação SDR',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#D1E7DD' },
    { id: 'interesse_confirmado', name: 'Interesse Confirmado', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#BAD4BA' },
    { id: 'visita_agendada',      name: 'Visita Agendada',      order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#8DB600' },
  ]},
  { id: 'outbound-wizmart', name: 'Outbound — WizMart', type: 'outbound', productId: 'wizmart', color: '#8DB600', isActive: true, stages: [
    { id: 'prospect_id',    name: 'Prospect Identificado', order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FFFFF0' },
    { id: 'primeiro_cont',  name: 'Primeiro Contato',      order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FEFCE8' },
    { id: 'int_confirmado', name: 'Interesse Confirmado',  order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FEF9C3' },
    { id: 'visita_out',     name: 'Visita Agendada',       order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#FDE047' },
  ]},
  { id: 'hunter-wizmart',   name: 'Hunter — WizMart',   type: 'hunter',   productId: 'wizmart', color: '#B91C1C', isActive: true, stages: [
    { id: 'visita_ag_h', name: 'Visita Agendada',      order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FEE2E2' },
    { id: 'visita_real', name: 'Visita Realizada',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FECACA' },
    { id: 'proposta_ap', name: 'Proposta Apresentada', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FCA5A5' },
    { id: 'negociacao',  name: 'Negociação',           order: 4, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 7, defaultTemplateIds: [], color: '#F87171' },
    { id: 'contrato',    name: 'Contrato Assinado',    order: 5, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#EF4444' },
    { id: 'pdv_ativo',   name: 'PDV Ativo',            order: 6, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 3, slaBusinessDays: 0, defaultTemplateIds: [], color: '#DC2626' },
  ]},
  { id: 'inbound-smart_cafe',  name: 'Inbound — Smart Café',  type: 'inbound',  productId: 'smart_cafe', color: '#5E3A26', isActive: true, stages: [
    { id: 'lead_recebido_c',        name: 'Lead Recebido',        order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FAF2EC' },
    { id: 'qualif_sdr_c',           name: 'Qualificação SDR',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FDF7F2' },
    { id: 'interesse_confirmado_c', name: 'Interesse Confirmado', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#EADFD9' },
    { id: 'visita_agendada_c',      name: 'Visita Agendada',      order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#D4A373' },
  ]},
  { id: 'outbound-smart_cafe', name: 'Outbound — Smart Café', type: 'outbound', productId: 'smart_cafe', color: '#D4A373', isActive: true, stages: [
    { id: 'prospect_id_c',    name: 'Prospect Identificado', order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FAF2EC' },
    { id: 'primeiro_cont_c',  name: 'Primeiro Contato',      order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FDF7F2' },
    { id: 'int_confirmado_c', name: 'Interesse Confirmado',  order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#EADFD9' },
    { id: 'visita_out_c',     name: 'Visita Agendada',       order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#D4A373' },
  ]},
  { id: 'hunter-smart_cafe',   name: 'Hunter — Smart Café',   type: 'hunter',   productId: 'smart_cafe', color: '#5E3A26', isActive: true, stages: [
    { id: 'visita_ag_h_c', name: 'Visita Agendada',      order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FAF2EC' },
    { id: 'visita_real_c', name: 'Visita Realizada',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FDF7F2' },
    { id: 'proposta_ap_c', name: 'Proposta Apresentada', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#EADFD9' },
    { id: 'negociacao_c',  name: 'Negociação',           order: 4, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 7, defaultTemplateIds: [], color: '#D4A373' },
    { id: 'contrato_c',    name: 'Contrato Assinado',    order: 5, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#5E3A26' },
    { id: 'pdv_ativo_c',   name: 'PDV Ativo',            order: 6, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 3, slaBusinessDays: 0, defaultTemplateIds: [], color: '#2C1A10' },
  ]},
];

// ── Estágios legados (compat. v1) ────────────────────────────────────────────
const stages = [
  { id: 'prospec',  name: 'Prospecção' },
  { id: 'qualif',   name: 'Qualificação' },
  { id: 'proposta', name: 'Proposta' },
  { id: 'negoc',    name: 'Negociação' },
  { id: 'fecham',   name: 'Fechamento' },
];

// ── Templates de playbook ─────────────────────────────────────────────────────
const templates = [
  { id: 'tpl-001', name: 'Primeiro Email — Inbound', funnelType: 'inbound', activityType: 'email', role: 'sdr',
    subject: 'Olá {{contactFirstName}}, vimos que você tem interesse em {{productName}}!',
    body: `Olá {{contactFirstName}}, tudo bem?\n\nIdentifiquei que sua empresa ({{companyName}}) pode se beneficiar muito da nossa solução {{productName}}.\n\nGostaria de agendar 20 minutos para apresentar como estamos ajudando empresas como a sua a crescer.\n\nFico à disposição!\n\nAbraços,\n{{userName}}`,
    variables: ['contactFirstName', 'companyName', 'productName', 'userName'], isActive: true, usageCount: 0 },
  { id: 'tpl-002', name: 'Confirmação de Visita — Hunter', funnelType: 'hunter', activityType: 'whatsapp', role: 'rep',
    body: `Olá {{contactFirstName}}! 👋\n\nPassando para confirmar nossa visita {{visitDate}} às {{visitTime}}.\n\nEstarei em {{companyName}} para apresentar {{productName}}.\n\nQualquer dúvida, estou aqui! 🤝`,
    variables: ['contactFirstName', 'visitDate', 'visitTime', 'companyName', 'productName'], isActive: true, usageCount: 0 },
];

// ── Conquistas (badges) ───────────────────────────────────────────────────────
const achievements = [
  { id: 'first-contact', icon: 'Zap',            name: 'Primeiro contato', unlocked: false },
  { id: 'streak-5',      icon: 'Flame',          name: '5 dias seguidos',  unlocked: false },
  { id: 'meetings-10',   icon: 'Calendar',       name: '10 reuniões',      prog: 0, unlocked: false },
  { id: 'handoff-10',    icon: 'ArrowRightLeft', name: '10 handoffs',      prog: 0, unlocked: false },
  { id: 'coins-50',      icon: 'Coins',          name: '50 moedas',        prog: 0, unlocked: false },
];

// ── Catálogo inicial da loja (editável) ───────────────────────────────────────
const prizes = [
  { id: 'prize-001', productId: 'all', name: 'Voucher iFood R$ 50',  description: 'Voucher de R$ 50 no iFood.',   imageUrl: '', coinCost: 10, stock: -1, category: 'voucher',     isActive: true },
  { id: 'prize-002', productId: 'all', name: 'Day Off',              description: 'Um dia de folga remunerado.',  imageUrl: '', coinCost: 40, stock: 2,  category: 'experiencia', isActive: true },
  { id: 'prize-003', productId: 'all', name: 'Voucher Amazon R$ 100', description: 'Voucher de R$ 100 na Amazon.', imageUrl: '', coinCost: 20, stock: -1, category: 'voucher',     isActive: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertAdminUser() {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
    await auth.updateUser(userRecord.uid, { password: ADMIN_PASSWORD, displayName: ADMIN_NAME, emailVerified: true, disabled: false });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    userRecord = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: ADMIN_NAME, emailVerified: true, disabled: false });
  }
  await auth.setCustomUserClaims(userRecord.uid, { tenantId, role: 'master', productIds: PRODUCT_IDS });
  return userRecord.uid;
}

async function setDocs(collectionPath, docs) {
  const batch = db.batch();
  for (const item of docs) {
    const { id, ...data } = item;
    batch.set(db.doc(`${collectionPath}/${id}`), { ...data, createdAt: TS() }, { merge: true });
  }
  await batch.commit();
}

async function main() {
  const base = `tenants/${tenantId}`;

  console.log(`[bootstrap] Projeto=${projectId}  Tenant=${tenantId}`);
  console.log('[bootstrap] Criando/atualizando admin master no Auth...');
  const adminUid = await upsertAdminUser();

  console.log('[bootstrap] Documento raiz do tenant...');
  await db.doc(base).set({ name: 'WizMart', productIds: PRODUCT_IDS, createdAt: TS() }, { merge: true });

  console.log('[bootstrap] Usuário admin no Firestore...');
  await db.doc(`${base}/users/${adminUid}`).set({
    uid: adminUid, email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'master',
    initials: ADMIN_NAME.slice(0, 2).toUpperCase(), color: '#1A6B1A',
    points: 0, coinBalance: 0, streak: 0, level: 1,
    productIds: PRODUCT_IDS, calendarConnected: false, isActive: true, createdAt: TS(),
  }, { merge: true });

  console.log('[bootstrap] Estrutura (funis, estágios, templates, conquistas, loja)...');
  await setDocs(`${base}/funnels`,      funnels);
  await setDocs(`${base}/stages`,       stages);
  await setDocs(`${base}/templates`,    templates);
  await setDocs(`${base}/achievements`, achievements);
  await setDocs(`${base}/prizes`,       prizes);

  console.log('[bootstrap] Nós base do Realtime Database (vazios/zerados)...');
  await rtdb.ref(`tenants/${tenantId}/leaderboard`).set({});
  await rtdb.ref(`tenants/${tenantId}/live_kpis`).set({
    monthRevenue: 0, monthGoal: 0, todayDeals: 0, todayRevenue: 0,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  // Link de redefinição de senha para o admin definir a própria senha
  let resetLink = null;
  try { resetLink = await auth.generatePasswordResetLink(ADMIN_EMAIL); } catch { /* ignore */ }

  console.log('\n✅ Bootstrap de produção concluído.');
  console.log(`   Admin master: ${ADMIN_EMAIL}  (uid=${adminUid})`);
  console.log(`   Senha temporária: ${ADMIN_PASSWORD}`);
  if (resetLink) {
    console.log('\n🔐 Link para o admin definir a própria senha (enviar ao cliente):');
    console.log(`   ${resetLink}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[bootstrap] Erro:', e); process.exit(1); });
