/**
 * Seed v3 — WizMart CRM  (demo para diretoria)
 *
 * 30 deals distribuídos em todos os 10 estágios
 * 8 conquistas (inaugurado) no mês corrente
 * ~28 PDVs conquistados + mapa de visitas por estado
 * cohortKeys preenchidos, activities realistas, projetos de layout
 *
 * Uso: node scripts/seed/seed-emulators.mjs
 */

import { createRequire } from 'node:module';

const require  = createRequire(import.meta.url);
const admin    = require('../../functions/node_modules/firebase-admin');

// SEED_TARGET=prod → escreve em PRODUÇÃO (codifyx7) usando ADC; senão, emulador local.
const IS_PROD = process.env.SEED_TARGET === 'prod';

const projectId = process.env.GCLOUD_PROJECT
  || (IS_PROD ? 'codifyx7' : (process.env.VITE_FIREBASE_PROJECT_ID || 'demo-wizmart-crm-local'));
const tenantId  = 'wizmart_sp';

if (IS_PROD) {
  console.log('⚠️  SEED_TARGET=prod — escrevendo em PRODUÇÃO:', projectId);
  admin.initializeApp({
    projectId,
    credential: admin.credential.applicationDefault(),
    databaseURL: 'https://codifyx7-default-rtdb.firebaseio.com',
  });
} else {
  process.env.FIREBASE_AUTH_EMULATOR_HOST      = process.env.FIREBASE_AUTH_EMULATOR_HOST      || '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST          = process.env.FIRESTORE_EMULATOR_HOST           || '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST  = process.env.FIREBASE_DATABASE_EMULATOR_HOST   || '127.0.0.1:9000';
  admin.initializeApp({
    projectId,
    databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${projectId}-default-rtdb`,
  });
}

const db   = admin.firestore();
const auth = admin.auth();
const rtdb = admin.database();
const TS   = admin.firestore.FieldValue.serverTimestamp;

const NOW    = new Date('2026-06-10T10:00:00Z');
const MONTH  = '2026-06';

function daysAgo(n)   { const d = new Date(NOW); d.setDate(d.getDate() - n); return d.toISOString(); }
function daysAhead(n) { const d = new Date(NOW); d.setDate(d.getDate() + n); return d.toISOString(); }
function fmtDue(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function dueDaysAgo(n)   { const d = new Date(NOW); d.setDate(d.getDate() - n); return fmtDue(d); }
function dueDaysAhead(n) { const d = new Date(NOW); d.setDate(d.getDate() + n); return fmtDue(d); }

// ── Usuários ──────────────────────────────────────────────────────────────────
const users = [
  { uid: 'master-001',  email: 'master@wizmart.com.br',  password: 'senha_de_teste_123', role: 'master',  name: 'Ricardo Master',        initials: 'RM', color: '#1A6B1A', points: 3240, coinBalance: 145, streak: 12, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'manager-001', email: 'manager@wizmart.com.br', password: 'senha_de_teste_123', role: 'manager', name: 'Fernanda Gestora',       initials: 'FG', color: '#0E7490', points: 2580, coinBalance: 112, streak:  8, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'bdr-001',     email: 'bdr@wizmart.com.br',     password: 'senha_de_teste_123', role: 'bdr',     name: 'Lucas BDR',              initials: 'LB', color: '#7C3AED', points: 1240, coinBalance:  64, streak:  5, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'sdr-001',     email: 'sdr@wizmart.com.br',     password: 'senha_de_teste_123', role: 'sdr',     name: 'João SDR',               initials: 'JS', color: '#B45309', points: 2180, coinBalance:  98, streak: 10, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'rep-001',     email: 'rep@wizmart.com.br',     password: 'senha_de_teste_123', role: 'rep',     name: 'Carla Rep',              initials: 'CR', color: '#B91C1C', points: 2760, coinBalance: 132, streak: 15, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'viewer-001',  email: 'viewer@wizmart.com.br',  password: 'senha_de_teste_123', role: 'viewer',  name: 'Paulo Viewer',           initials: 'PV', color: '#4B5563', points:  180, coinBalance:   5, streak:  0, productIds: ['wizmart', 'smart_cafe'], isActive: true },
  { uid: 'design-001',  email: 'design@wizmart.com.br',  password: 'senha_de_teste_123', role: 'design',  name: 'Fernanda Design',        initials: 'FD', color: '#7C3AED', points:    0, coinBalance:   0, streak:  0, productIds: ['wizmart'],               isActive: true },
  { uid: 'sdr-002',     email: 'sdr2@wizmart.com.br',    password: 'senha_de_teste_123', role: 'sdr',     name: 'Mariana SDR',            initials: 'MS', color: '#D97706', points: 1640, coinBalance:  72, streak:  6, productIds: ['smart_cafe'],            isActive: true },
  { uid: 'rep-002',     email: 'rep2@wizmart.com.br',    password: 'senha_de_teste_123', role: 'rep',     name: 'Roberto Rep',            initials: 'RH', color: '#78350F', points: 2290, coinBalance: 104, streak:  9, productIds: ['smart_cafe'],            isActive: true },
  { uid: 'bdr-002',     email: 'bdr2@wizmart.com.br',    password: 'senha_de_teste_123', role: 'bdr',     name: 'Daniela BDR',            initials: 'DB', color: '#EC4899', points:  920, coinBalance:  38, streak:  3, productIds: ['smart_cafe'],            isActive: true },
  // Fase 5.4 do PLANO_DESENHO_CRM.md — só valida contrato de Comodato Smart Café.
  { uid: 'financeiro-001', email: 'financeiro@wizmart.com.br', password: 'senha_de_teste_123', role: 'financeiro', name: 'Fátima Financeiro', initials: 'FF', color: '#5E3A26', points: 0, coinBalance: 0, streak: 0, productIds: ['smart_cafe'], isActive: true },
];

// ── Funis v3 ──────────────────────────────────────────────────────────────────
const funnels = [
  {
    id: 'wizmart', name: 'WizMart', type: 'main', productId: 'wizmart', color: '#1A6B1A', isActive: true,
    stages: [
      { id: 'lista_potencial',       name: 'Lista Potencial',       order: 1,  coinsOnEnter: 0, slaBusinessDays:  2, isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
      { id: 'prospeccao',            name: 'Prospecção',            order: 2,  coinsOnEnter: 0, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#D8EDD8' },
      { id: 'conectado',             name: 'Conectado',             order: 3,  coinsOnEnter: 1, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#BAD4BA', hasConnectionSubtype: false },
      // Fase 1.1 do PLANO_DESENHO_CRM.md — etapas de reunião só no WizMart
      { id: 'reuniao_agendada',      name: 'Reunião Agendada',      order: 4,  coinsOnEnter: 1, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#ACCBA0' },
      { id: 'reuniao_realizada',     name: 'Reunião Realizada',     order: 5,  coinsOnEnter: 2, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#9DC080' },
      { id: 'visita_agendada',       name: 'Visita Agendada',       order: 6,  coinsOnEnter: 1, slaBusinessDays:  5, isHandoffRequired: true,  defaultTemplateIds: [], color: '#8DB600' },
      { id: 'visita_realizada',      name: 'Visita Realizada',      order: 7,  coinsOnEnter: 2, slaBusinessDays:  5, isHandoffRequired: false, defaultTemplateIds: [], color: '#6DA000' },
      { id: 'proposta_apresentada',  name: 'Proposta Apresentada',  order: 8,  coinsOnEnter: 1, slaBusinessDays:  7, isHandoffRequired: false, defaultTemplateIds: [], color: '#5A8A00' },
      { id: 'negociacao_contratual', name: 'Negociação Contratual', order: 9,  coinsOnEnter: 0, slaBusinessDays: 10, isHandoffRequired: false, defaultTemplateIds: [], color: '#3D6B00' },
      { id: 'contrato_assinado',     name: 'Contrato Assinado',     order: 10, coinsOnEnter: 2, slaBusinessDays:  7, isHandoffRequired: false, defaultTemplateIds: [], color: '#2A5000' },
      { id: 'instalacao_agendada',   name: 'Instalação Agendada',   order: 11, coinsOnEnter: 1, slaBusinessDays:  5, isHandoffRequired: false, defaultTemplateIds: [], color: '#1A3E00' },
      { id: 'instalacao_realizada',  name: 'Instalação Realizada',  order: 12, coinsOnEnter: 2, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#122D00' },
      { id: 'inaugurado',            name: 'Inaugurado',            order: 13, coinsOnEnter: 5, slaBusinessDays:  0, isHandoffRequired: false, defaultTemplateIds: [], color: '#0D2800' },
      { id: 'perdeu',                name: 'Perdeu',                order: 14, coinsOnEnter: 0, slaBusinessDays:  0, isHandoffRequired: false, defaultTemplateIds: [], color: '#4B1113', isLost: true },
    ],
  },
  {
    id: 'smart_cafe', name: 'Smart Café', type: 'main', productId: 'smart_cafe', color: '#5E3A26', isActive: true,
    stages: [
      { id: 'lista_potencial',       name: 'Lista Potencial',              order: 1,  coinsOnEnter: 0, slaBusinessDays:  2, isHandoffRequired: false, defaultTemplateIds: [], color: '#FAF2EC' },
      { id: 'prospeccao',            name: 'Prospecção',                   order: 2,  coinsOnEnter: 0, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#F5E6D8' },
      { id: 'conectado',             name: 'Conectado ao Representante',   order: 3,  coinsOnEnter: 1, slaBusinessDays:  3, isHandoffRequired: false, defaultTemplateIds: [], color: '#EADFD9', hasConnectionSubtype: true },
      { id: 'proposta_apresentada',  name: 'Proposta Apresentada',         order: 4,  coinsOnEnter: 1, slaBusinessDays:  7, isHandoffRequired: false, defaultTemplateIds: [], color: '#E8CDB0' },
      { id: 'degustacao_agendada',   name: 'Degustação Agendada',          order: 5,  coinsOnEnter: 1, slaBusinessDays:  5, isHandoffRequired: false, defaultTemplateIds: [], color: '#D4A373' },
      { id: 'degustacao_realizada',  name: 'Degustação Realizada',         order: 6,  coinsOnEnter: 2, slaBusinessDays:  5, isHandoffRequired: false, defaultTemplateIds: [], color: '#C8925D' },
      { id: 'negociacao_contratual', name: 'Negociação Contratual',        order: 7,  coinsOnEnter: 0, slaBusinessDays: 10, isHandoffRequired: false, defaultTemplateIds: [], color: '#9E5E30' },
      { id: 'contrato_assinado',     name: 'Contrato Assinado',            order: 8,  coinsOnEnter: 2, slaBusinessDays:  7, isHandoffRequired: false, defaultTemplateIds: [], color: '#7E4820' },
      { id: 'instalacao_realizada',  name: 'Instalação Realizada',         order: 9,  coinsOnEnter: 5, slaBusinessDays:  0, isHandoffRequired: false, defaultTemplateIds: [], color: '#3B2015' },
      { id: 'perdeu',                name: 'Perdeu',                       order: 10, coinsOnEnter: 0, slaBusinessDays:  0, isHandoffRequired: false, defaultTemplateIds: [], color: '#4B1113', isLost: true },
    ],
  },

  // ── Funis LEGADOS — presentes em produção, ausentes daqui até set/2026 ──────
  // Produção tem estes três além do funil unificado do WizMart, e é isso que
  // produzia as 4 abas do mesmo produto que o deck pediu para acabar (Fase 1.3
  // do PLANO_DESENHO_CRM.md). Sem eles no seed, o ambiente local não reproduz o
  // problema e a correção fica sem como ser verificada fora de produção.
  // `pipelineBoards` deve colapsar os quatro num único board WizMart.
  {
    id: 'inbound-wizmart', name: 'Inbound — WizMart', type: 'inbound', productId: 'wizmart', color: '#1A6B1A', isActive: true,
    stages: [
      { id: 'lista_potencial', name: 'Lista Potencial', order: 1, coinsOnEnter: 0, slaBusinessDays: 2, isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
      { id: 'prospeccao',      name: 'Prospecção',      order: 2, coinsOnEnter: 0, slaBusinessDays: 3, isHandoffRequired: false, defaultTemplateIds: [], color: '#D8EDD8' },
      { id: 'conectado',       name: 'Conectado',       order: 3, coinsOnEnter: 1, slaBusinessDays: 3, isHandoffRequired: false, defaultTemplateIds: [], color: '#BAD4BA' },
    ],
  },
  {
    id: 'outbound-wizmart', name: 'Outbound — WizMart', type: 'outbound', productId: 'wizmart', color: '#1A6B1A', isActive: true,
    stages: [
      { id: 'lista_potencial', name: 'Lista Potencial', order: 1, coinsOnEnter: 0, slaBusinessDays: 2, isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
      { id: 'prospeccao',      name: 'Prospecção',      order: 2, coinsOnEnter: 0, slaBusinessDays: 3, isHandoffRequired: false, defaultTemplateIds: [], color: '#D8EDD8' },
    ],
  },
  {
    id: 'bdr-outbound', name: 'BDR - Outbound', type: 'outbound', productId: 'wizmart', color: '#1A6B1A', isActive: true,
    stages: [
      { id: 'lista_potencial', name: 'Lista Potencial', order: 1, coinsOnEnter: 0, slaBusinessDays: 2, isHandoffRequired: false, defaultTemplateIds: [], color: '#F0F7F0' },
    ],
  },
];

const stages = [
  { id: 'lista_potencial',       name: 'Lista Potencial'        },
  { id: 'prospeccao',            name: 'Prospecção'             },
  { id: 'conectado',             name: 'Conectado'              },
  { id: 'reuniao_agendada',      name: 'Reunião Agendada'       },
  { id: 'reuniao_realizada',     name: 'Reunião Realizada'      },
  { id: 'visita_agendada',       name: 'Visita Agendada'        },
  { id: 'visita_realizada',      name: 'Visita Realizada'       },
  { id: 'proposta_apresentada',  name: 'Proposta Apresentada'   },
  { id: 'degustacao_agendada',   name: 'Degustação Agendada'    },
  { id: 'degustacao_realizada',  name: 'Degustação Realizada'   },
  { id: 'negociacao_contratual', name: 'Negociação Contratual'  },
  { id: 'contrato_assinado',     name: 'Contrato Assinado'      },
  { id: 'instalacao_agendada',   name: 'Instalação Agendada'    },
  { id: 'instalacao_realizada',  name: 'Instalação Realizada'   },
  { id: 'inaugurado',            name: 'Inaugurado'             },
  { id: 'perdeu',                name: 'Perdeu'                 },
];

// ── Deals v3 — 30 deals, todos os estágios cobertos ──────────────────────────
// ─── WizMart (18 deals) ───────────────────────────────────────────────────────
const deals = [
  // ── Deals presos em funis LEGADOS (Fase 1.3) ────────────────────────────────
  // Reproduzem o acervo de produção: cards que moram num funil antigo e, com
  // `dealBelongsToBoard`, passam a aparecer no board único do WizMart sem que o
  // documento precise ser migrado. `deal-legado-lp` tem `leadOrigin` e é o
  // único Inbound do seed — é o que dá o que filtrar no subbar.
  {
    id: 'deal-legado-lp', name: 'Mercado do Bairro (via Landing Page)', company: 'Mercado do Bairro SP', value: 42000,
    stage: 'prospeccao', funnelId: 'inbound-wizmart', funnelType: 'inbound', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'sdr-001', assignedSdrId: 'sdr-001',
    leadOrigin: { leadId: 'lead-seed-001', sourceId: 'lp-wizmart', sourceName: 'Landing Page WizMart' },
    due: dueDaysAhead(4), status: 'open', uf: 'SP',
    cohortKeys: {},
    createdAt: daysAgo(9), updatedAt: daysAgo(2),
  },
  {
    id: 'deal-legado-out', name: 'Atacado Vale Verde', company: 'Vale Verde Atacado PR', value: 76000,
    stage: 'lista_potencial', funnelId: 'bdr-outbound', funnelType: 'outbound', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'bdr-001', bdrId: 'bdr-001',
    due: dueDaysAhead(6), status: 'in_queue', uf: 'PR',
    cohortKeys: {},
    createdAt: daysAgo(11), updatedAt: daysAgo(11),
  },

  // ── Lista Potencial (2)
  {
    id: 'deal-001', name: 'Rede Supermercados Horizonte',      company: 'Horizonte Atacarejo MG',     value: 185000,
    stage: 'lista_potencial',    funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'bdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(5), status: 'in_queue', uf: 'MG',
    cohortKeys: {},
    createdAt: daysAgo(6), updatedAt: daysAgo(6),
  },
  {
    id: 'deal-002', name: 'Distribuidora Paulista — Lote 12',  company: 'DP Alimentos SP',            value: 98000,
    stage: 'lista_potencial',    funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_kit_alimentacao',
    owner: 'bdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(7), status: 'in_queue', uf: 'SP',
    cohortKeys: {},
    createdAt: daysAgo(4), updatedAt: daysAgo(4),
  },
  // ── Prospecção (2)
  {
    id: 'deal-003', name: 'Contrato Anual — WizDistribuidora', company: 'WizDistribuidora SP',        value: 156000,
    stage: 'prospeccao',         funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'sdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(9), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH },
    createdAt: daysAgo(9), updatedAt: daysAgo(3),
  },
  {
    id: 'deal-004', name: 'Abastecimento Norte — AgroBrasil',  company: 'AgroBrasil PA',              value: 125000,
    stage: 'prospeccao',         funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_kit_alimentacao',
    owner: 'sdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(10), status: 'open', uf: 'PA',
    cohortKeys: { prospectsSharedMonth: MONTH },
    createdAt: daysAgo(8), updatedAt: daysAgo(2),
  },
  // ── Conectado (2)
  {
    id: 'deal-005', name: 'Franquia Centro-Oeste — SulLog',    company: 'SulLog Distribuidora DF',    value: 210000,
    stage: 'conectado',          funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'sdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(8), status: 'open', uf: 'DF',
    cohortKeys: { prospectsSharedMonth: MONTH, activitiesCount: 4 },
    createdAt: daysAgo(12), updatedAt: daysAgo(1),
  },
  {
    id: 'deal-006', name: 'Renovação Trimestral — TechSupply', company: 'TechSupply Nordeste',        value: 67000,
    stage: 'conectado',          funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_kit_alimentacao',
    owner: 'sdr-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001',
    due: dueDaysAhead(6), status: 'open', uf: 'CE',
    cohortKeys: { prospectsSharedMonth: MONTH, activitiesCount: 3 },
    createdAt: daysAgo(10), updatedAt: daysAgo(2),
  },
  // ── Visita Agendada (2)
  {
    id: 'deal-007', name: 'Expansão Loja 3 — Grupo Meridian',  company: 'Grupo Meridian Atacado RJ',  value: 87000,
    stage: 'visita_agendada',    funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(4), status: 'open', uf: 'RJ',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 6 },
    createdAt: daysAgo(20), updatedAt: daysAgo(1),
  },
  {
    id: 'deal-008', name: 'Nanomarket Corporativo — Vivo',     company: 'Vivo Telecom SP',            value: 145000,
    stage: 'visita_agendada',    funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(3), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 5 },
    createdAt: daysAgo(18), updatedAt: daysAgo(1),
  },
  // ── Visita Realizada (1)
  {
    id: 'deal-009', name: 'Atacarejo Sul — Rede Master',       company: 'Rede Master RS',             value: 310000,
    stage: 'visita_realizada',   funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(14), status: 'open', uf: 'RS',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 8 },
    createdAt: daysAgo(25), updatedAt: daysAgo(2),
  },
  // ── Proposta Apresentada (2)
  {
    id: 'deal-010', name: 'Minimarket Sede Corporativa',       company: 'Santander Banco SP',         value: 230000,
    stage: 'proposta_apresentada', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(12), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 10 },
    createdAt: daysAgo(30), updatedAt: daysAgo(3),
  },
  {
    id: 'deal-011', name: 'Container Externo — Shopping Bela Vista', company: 'Unibel Empreendimentos BA', value: 178000,
    stage: 'proposta_apresentada', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(15), status: 'open', uf: 'BA',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 7 },
    createdAt: daysAgo(28), updatedAt: daysAgo(4),
  },
  // ── Negociação Contratual (1)
  {
    id: 'deal-012', name: 'Loja Compacta — Hospital Albert Einstein', company: 'HCE Hospital SP',          value: 320000,
    stage: 'negociacao_contratual', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(18), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 12 },
    createdAt: daysAgo(35), updatedAt: daysAgo(1),
  },
  // ── Contrato Assinado (1)
  {
    id: 'deal-013', name: 'Galeria Comercial — WTC SP',        company: 'WTC Empreendimentos SP',     value: 290000,
    stage: 'contrato_assinado',  funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(10), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 14 },
    createdAt: daysAgo(40), updatedAt: daysAgo(2),
  },
  // ── Instalação Agendada (2)
  {
    id: 'deal-014', name: 'Torre Empresarial — Brooklin',      company: 'Brooklin Business Center SP',value: 265000,
    stage: 'instalacao_agendada', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(5), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 16 },
    createdAt: daysAgo(45), updatedAt: daysAgo(1),
  },
  {
    id: 'deal-015', name: 'Fábrica da Cerveja — Ambev PR',     company: 'Ambev Unidade Curitiba',     value: 195000,
    stage: 'instalacao_agendada', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(7), status: 'open', uf: 'PR',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 11 },
    createdAt: daysAgo(42), updatedAt: daysAgo(2),
  },
  // ── Inaugurado / Won (3) — conquistas do mês
  {
    id: 'deal-016', name: 'Distribuição Regional — Conecta Log', company: 'Conecta Log SP',           value: 203000,
    stage: 'inaugurado', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    conquestValue: 2, owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAgo(8), status: 'won', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 18 },
    createdAt: daysAgo(50), updatedAt: daysAgo(8),
  },
  {
    id: 'deal-017', name: 'Condomínio Empresarial — Alphaville', company: 'Alphaville Residencial SP', value: 348000,
    stage: 'inaugurado', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    conquestValue: 3, owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAgo(5), status: 'won', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 22 },
    createdAt: daysAgo(55), updatedAt: daysAgo(5),
  },
  {
    id: 'deal-018', name: 'Parque Industrial — Bosch Campinas', company: 'Bosch Brasil SC',            value: 412000,
    stage: 'inaugurado', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    conquestValue: 2, owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAgo(3), status: 'won', uf: 'SC',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 20 },
    createdAt: daysAgo(52), updatedAt: daysAgo(3),
  },

  // ─── Smart Café (12 deals) ────────────────────────────────────────────────

  // ── Lista Potencial (1)
  {
    id: 'deal-019', name: 'Filtros & Acessórios — Coffee Lovers', company: 'Coffee Lovers SP',        value: 14500,
    stage: 'lista_potencial',    funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    owner: 'bdr-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002',
    due: dueDaysAhead(6), status: 'in_queue', uf: 'SP',
    cohortKeys: {},
    createdAt: daysAgo(3), updatedAt: daysAgo(3),
  },
  // ── Prospecção (2)
  {
    id: 'deal-020', name: 'Grãos Premium — Padaria Central',    company: 'Padaria Central SC',        value: 18500,
    stage: 'prospeccao',         funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    owner: 'sdr-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002',
    due: dueDaysAhead(8), status: 'open', uf: 'SC',
    cohortKeys: { prospectsSharedMonth: MONTH },
    createdAt: daysAgo(7), updatedAt: daysAgo(2),
  },
  {
    id: 'deal-021', name: 'Parceria OCS — Consultório Odonto',  company: 'Clínica Odonto SP',         value: 9500,
    stage: 'prospeccao',         funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_venda_direta',
    owner: 'sdr-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002',
    due: dueDaysAhead(7), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH },
    createdAt: daysAgo(6), updatedAt: daysAgo(2),
  },
  // ── Conectado (1) — Pequeno (standard_proposal)
  {
    id: 'deal-022', name: 'Lote Gourmet — Empório das Artes',   company: 'Empório das Artes PR',      value: 29000,
    stage: 'conectado',          funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_locacao',
    clientSize: 'small', connectionType: 'standard_proposal',
    owner: 'sdr-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002',
    due: dueDaysAhead(5), status: 'open', uf: 'PR',
    cohortKeys: { prospectsSharedMonth: MONTH, activitiesCount: 3 },
    createdAt: daysAgo(10), updatedAt: daysAgo(1),
  },
  // ── Degustação Agendada (1) — Grande
  {
    id: 'deal-023', name: 'Máquinas de Espresso — Bistrô Paris', company: 'Bistrô Paris RJ',          value: 45000,
    stage: 'degustacao_agendada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_venda_direta',
    clientSize: 'large', connectionType: 'visit_scheduled',
    owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAhead(4), status: 'open', uf: 'RJ',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 5 },
    createdAt: daysAgo(22), updatedAt: daysAgo(1),
  },
  // ── Proposta Apresentada (2)
  {
    id: 'deal-024', name: 'Franquia Caramelo — Estação Café',   company: 'Estação Café BH',           value: 68000,
    stage: 'proposta_apresentada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_venda_direta',
    clientSize: 'medium', connectionType: 'meeting_scheduled',
    owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAhead(10), status: 'open', uf: 'MG',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 7 },
    createdAt: daysAgo(28), updatedAt: daysAgo(3),
  },
  {
    id: 'deal-025', name: 'Smart Café Corporativo — Ambev HQ',  company: 'Ambev HQ SP',               value: 82000,
    stage: 'proposta_apresentada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    clientSize: 'large', connectionType: 'visit_scheduled',
    owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAhead(12), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 9 },
    createdAt: daysAgo(32), updatedAt: daysAgo(2),
  },
  // ── Contrato Assinado (1)
  {
    id: 'deal-026', name: 'Comodato Hospitalar — Sírio-Libanês', company: 'HSL Hospital SP',          value: 135000,
    stage: 'contrato_assinado',  funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    clientSize: 'large', connectionType: 'visit_scheduled',
    owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAhead(8), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 13 },
    // Fase 5.4 — contrato anexado, aguardando o financeiro confirmar o
    // pagamento da 1ª mensalidade. É o exemplo "pendente" da fila.
    contract: {
      url: 'https://storage.googleapis.com/wizmart-crm.appspot.com/demo/contrato-hsl.pdf',
      storagePath: `tenants/wizmart_sp/deals/deal-026/contract/demo1/Contrato HSL.pdf`,
      fileName: 'Contrato HSL.pdf', mime: 'application/pdf', size: 482_133,
      uploadedBy: 'rep-002', uploadedAt: daysAgo(1),
    },
    createdAt: daysAgo(38), updatedAt: daysAgo(1),
  },
  // ── Instalação Realizada / Won (3) — conquistas do mês Smart Café
  {
    id: 'deal-027', name: 'Fornecimento Anual — Rede Caffè',    company: 'Rede Caffè SP',             value: 112000,
    stage: 'instalacao_realizada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
    clientSize: 'medium', connectionType: 'meeting_scheduled',
    conquestType: 'contract_value', conquestValue: 112000, owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAgo(6), status: 'won', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 16 },
    // Fase 5.4 — já validado pelo financeiro. Exemplo "já validado" da fila.
    contract: {
      url: 'https://storage.googleapis.com/wizmart-crm.appspot.com/demo/contrato-rede-caffe.pdf',
      storagePath: `tenants/wizmart_sp/deals/deal-027/contract/demo1/Contrato Rede Caffe.pdf`,
      fileName: 'Contrato Rede Caffe.pdf', mime: 'application/pdf', size: 398_211,
      uploadedBy: 'rep-002', uploadedAt: daysAgo(9),
    },
    contractPaidAt: daysAgo(6),
    contractPaidBy: 'financeiro-001',
    createdAt: daysAgo(48), updatedAt: daysAgo(6),
  },
  {
    id: 'deal-028', name: 'Café Expresso — Aeroporto Galeão',   company: 'Infraero RJ',               value: 96000,
    stage: 'instalacao_realizada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_locacao',
    clientSize: 'large', connectionType: 'visit_scheduled',
    conquestType: 'pdv', conquestValue: 1, owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAgo(4), status: 'won', uf: 'RJ',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 14 },
    createdAt: daysAgo(46), updatedAt: daysAgo(4),
  },
  {
    id: 'deal-029', name: 'Smart Café Premium — Copacabana Palace', company: 'Belmond Copacabana RJ',value: 148000,
    stage: 'instalacao_realizada', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_venda_direta',
    clientSize: 'large', connectionType: 'visit_scheduled',
    conquestType: 'pdv', conquestValue: 2, owner: 'rep-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002', assignedRepId: 'rep-002',
    due: dueDaysAgo(2), status: 'won', uf: 'RJ',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, conquestMonth: MONTH, activitiesCount: 19 },
    createdAt: daysAgo(54), updatedAt: daysAgo(2),
  },
  // ── Cross-sell — WizMart deal com SKU Smart Café
  {
    id: 'deal-030', name: 'Combo WizMart + Smart Café — Jundiaí Shopping', company: 'Jundiaí Shopping SP', value: 275000,
    stage: 'negociacao_contratual', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
    additionalProductIds: ['smartcafe_comodato'],
    owner: 'rep-001', bdrId: 'bdr-001', assignedSdrId: 'sdr-001', assignedRepId: 'rep-001',
    due: dueDaysAhead(16), status: 'open', uf: 'SP',
    cohortKeys: { prospectsSharedMonth: MONTH, visitScheduledMonth: MONTH, activitiesCount: 9 },
    createdAt: daysAgo(33), updatedAt: daysAgo(1),
  },
  // Carteira isolada p/ e2e de reatribuição (Fase 6.2 do PLANO_DESENHO_CRM.md)
  // — nenhum outro spec referencia sdr-002 nem este deal, de propósito.
  {
    id: 'deal-031', name: 'Torrefação Própria — Grão Nobre', company: 'Grão Nobre MG', value: 22000,
    stage: 'prospeccao', funnelId: 'smart_cafe', funnelType: 'main', productId: 'smart_cafe', mainProduct: 'smartcafe_venda_direta',
    owner: 'sdr-002', bdrId: 'bdr-002', assignedSdrId: 'sdr-002',
    due: dueDaysAhead(9), status: 'open', uf: 'MG',
    cohortKeys: { prospectsSharedMonth: MONTH },
    createdAt: daysAgo(5), updatedAt: daysAgo(1),
  },
  // Card p/ e2e de Solicitação de Projeto (PLANO_DESENHO_CRM_2, A1): WizMart SEM
  // `mainProduct`, como o card CSN do cliente — o botão "Solicitar Projeto" sumia
  // nele. Só a Carla (rep-001) participa.
  {
    id: 'deal-032', name: 'CSN - Volta Redonda', company: 'CSN', value: 0,
    stage: 'lista_potencial', funnelId: 'wizmart', funnelType: 'main', productId: 'wizmart',
    owner: 'rep-001', assignedRepId: 'rep-001',
    // Derivado pelo trigger onDealParticipantsChanged, mas o e2e não pode depender da corrida com ele.
    participantIds: ['rep-001'], responsibleId: 'rep-001',
    due: dueDaysAhead(12), status: 'open', uf: 'RJ',
    cohortKeys: {},
    createdAt: daysAgo(4), updatedAt: daysAgo(1),
  },
];

// ── Contatos ──────────────────────────────────────────────────────────────────
const contacts = [
  { id: 'c-001', name: 'Carlos Mendes',      role: 'Diretor de Compras',      company: 'WizDistribuidora SP',        email: 'carlos.mendes@wizdist.com.br',    phone: '(11) 98823-4501', whats: '(11) 98823-4501', owner: 'sdr-001', tags: ['Decisor', 'VIP'], deals: 1, productIds: ['wizmart'] },
  { id: 'c-002', name: 'Ana Silveira',        role: 'Gerente Comercial',       company: 'Grupo Meridian Atacado RJ',  email: 'ana.silveira@meridian.com.br',    phone: '(21) 99712-8830', whats: '(21) 99712-8830', owner: 'rep-001', tags: ['Influenciador'], deals: 1, productIds: ['wizmart'] },
  { id: 'c-003', name: 'Roberto Almeida',     role: 'CEO',                     company: 'Conecta Log SP',             email: 'roberto@conectalog.com.br',       phone: '(11) 99100-2233', whats: '(11) 99100-2233', owner: 'rep-001', tags: ['Decisor', 'VIP'], deals: 1, productIds: ['wizmart'] },
  { id: 'c-004', name: 'Marcela Ferreira',    role: 'Diretora de Facilities',  company: 'Santander Banco SP',         email: 'marcela.f@santander.com.br',      phone: '(11) 98744-5510', whats: '(11) 98744-5510', owner: 'rep-001', tags: ['Decisor'], deals: 1, productIds: ['wizmart'] },
  { id: 'c-005', name: 'Paulo Caffè',         role: 'Sócio Proprietário',      company: 'Rede Caffè SP',              email: 'paulo.caffe@redecaffe.com.br',    phone: '(11) 97722-1133', whats: '(11) 97722-1133', owner: 'sdr-002', tags: ['Decisor'], deals: 1, productIds: ['smart_cafe'] },
  { id: 'c-006', name: 'Luciana Dupont',      role: 'Gerente de A&B',          company: 'Bistrô Paris RJ',            email: 'luciana@bistroparis.com.br',      phone: '(21) 98311-2244', whats: '(21) 98311-2244', owner: 'rep-002', tags: ['VIP'], deals: 1, productIds: ['smart_cafe'] },
  { id: 'c-007', name: 'Eduardo Neves',       role: 'VP de Operações',         company: 'Ambev HQ SP',                email: 'e.neves@ambev.com.br',            phone: '(11) 99055-3344', whats: '(11) 99055-3344', owner: 'rep-002', tags: ['Decisor', 'VIP'], deals: 2, productIds: ['smart_cafe', 'wizmart'] },
  { id: 'c-008', name: 'Cristina Barcelos',   role: 'Gerente de Infraestrutura','company': 'Infraero RJ',              email: 'cristina.b@infraero.gov.br',      phone: '(21) 97733-8855', whats: '(21) 97733-8855', owner: 'rep-002', tags: ['Decisor'], deals: 1, productIds: ['smart_cafe'] },
  { id: 'c-009', name: 'Fernando Takahashi',  role: 'Superintendente',         company: 'Bosch Brasil SC',            email: 'f.takahashi@bosch.com.br',        phone: '(47) 98833-7711', whats: '(47) 98833-7711', owner: 'rep-001', tags: ['Decisor', 'VIP'], deals: 1, productIds: ['wizmart'] },
  { id: 'c-010', name: 'Juliana Monteiro',    role: 'Diretora Administrativa',  company: 'HSL Hospital SP',            email: 'juliana.m@hsl.org.br',            phone: '(11) 99966-1122', whats: '(11) 99966-1122', owner: 'rep-002', tags: ['Decisor'], deals: 1, productIds: ['smart_cafe'] },
];

// ── Empresas ──────────────────────────────────────────────────────────────────
const companies = [
  { id: 'wizdistribuidora-sp',    name: 'WizDistribuidora SP',          segment: 'Distribuição',  deals: 1, value: 156000, productIds: ['wizmart']               },
  { id: 'grupo-meridian-rj',      name: 'Grupo Meridian Atacado RJ',    segment: 'Atacado',       deals: 1, value: 87000,  productIds: ['wizmart']               },
  { id: 'conecta-log-sp',         name: 'Conecta Log SP',               segment: 'Logística',     deals: 1, value: 203000, productIds: ['wizmart']               },
  { id: 'santander-sp',           name: 'Santander Banco SP',           segment: 'Financeiro',    deals: 1, value: 230000, productIds: ['wizmart']               },
  { id: 'rede-master-rs',         name: 'Rede Master RS',               segment: 'Atacarejo',     deals: 1, value: 310000, productIds: ['wizmart']               },
  { id: 'alphaville-sp',          name: 'Alphaville Residencial SP',    segment: 'Imobiliário',   deals: 1, value: 348000, productIds: ['wizmart']               },
  { id: 'bosch-sc',               name: 'Bosch Brasil SC',              segment: 'Indústria',     deals: 1, value: 412000, productIds: ['wizmart']               },
  { id: 'ambev-curitiba',         name: 'Ambev Unidade Curitiba',       segment: 'Bebidas',       deals: 1, value: 195000, productIds: ['wizmart']               },
  { id: 'hce-hospital-sp',        name: 'HCE Hospital SP',              segment: 'Saúde',         deals: 1, value: 320000, productIds: ['wizmart']               },
  { id: 'wtc-sp',                 name: 'WTC Empreendimentos SP',       segment: 'Imobiliário',   deals: 1, value: 290000, productIds: ['wizmart']               },
  { id: 'brooklin-sp',            name: 'Brooklin Business Center SP',  segment: 'Imobiliário',   deals: 1, value: 265000, productIds: ['wizmart']               },
  { id: 'jundiai-shopping',       name: 'Jundiaí Shopping SP',          segment: 'Shopping',      deals: 1, value: 275000, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'rede-caffe-sp',          name: 'Rede Caffè SP',                segment: 'Cafeteria',     deals: 1, value: 112000, productIds: ['smart_cafe']            },
  { id: 'bistro-paris-rj',        name: 'Bistrô Paris RJ',              segment: 'Restaurante',   deals: 1, value: 45000,  productIds: ['smart_cafe']            },
  { id: 'estacao-cafe-bh',        name: 'Estação Café BH',              segment: 'Cafeteria',     deals: 1, value: 68000,  productIds: ['smart_cafe']            },
  { id: 'ambev-hq-sp',            name: 'Ambev HQ SP',                  segment: 'Bebidas',       deals: 2, value: 82000,  productIds: ['smart_cafe']            },
  { id: 'hsl-hospital-sp',        name: 'HSL Hospital SP',              segment: 'Saúde',         deals: 1, value: 135000, productIds: ['smart_cafe']            },
  { id: 'infraero-rj',            name: 'Infraero RJ',                  segment: 'Transporte',    deals: 1, value: 96000,  productIds: ['smart_cafe']            },
  { id: 'belmond-rj',             name: 'Belmond Copacabana RJ',        segment: 'Hospitalidade', deals: 1, value: 148000, productIds: ['smart_cafe']            },
];

// ── Activities — 28 registros realistas ───────────────────────────────────────
const activity = [
  // Conquistas (win)
  { id: 'act-001', productId: 'wizmart',     type: 'win',      userId: 'rep-001', text: 'fechou Conecta Log — R$ 203.000 (2 PDVs)', coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-016', createdAt: daysAgo(8) },
  { id: 'act-002', productId: 'wizmart',     type: 'win',      userId: 'rep-001', text: 'inaugurou Alphaville Residencial — 3 PDVs',  coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-017', createdAt: daysAgo(5) },
  { id: 'act-003', productId: 'wizmart',     type: 'win',      userId: 'rep-001', text: 'inaugurou Bosch Brasil SC — 2 PDVs',          coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-018', createdAt: daysAgo(3) },
  { id: 'act-004', productId: 'smart_cafe',  type: 'win',      userId: 'rep-002', text: 'fechou Rede Caffè — R$ 112.000 (2 PDVs)',     coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-027', createdAt: daysAgo(6) },
  { id: 'act-005', productId: 'smart_cafe',  type: 'win',      userId: 'rep-002', text: 'inaugurou Aeroporto Galeão — 1 PDV',          coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-028', createdAt: daysAgo(4) },
  { id: 'act-006', productId: 'smart_cafe',  type: 'win',      userId: 'rep-002', text: 'inaugurou Copacabana Palace — 2 PDVs',         coinsAwarded: 5, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-029', createdAt: daysAgo(2) },
  // SDR — atividades de cadência (hoje)
  { id: 'act-007', productId: 'wizmart',     type: 'whatsapp', userId: 'sdr-001', text: 'WhatsApp enviado para Carlos Mendes (WizDist)',coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-003', createdAt: daysAgo(0) },
  { id: 'act-008', productId: 'wizmart',     type: 'email',    userId: 'sdr-001', text: 'Email de apresentação — AgroBrasil PA',        coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-004', createdAt: daysAgo(0) },
  { id: 'act-009', productId: 'wizmart',     type: 'meeting',  userId: 'sdr-001', text: 'Reunião de qualificação — SulLog DF',          coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-005', createdAt: daysAgo(0) },
  { id: 'act-010', productId: 'wizmart',     type: 'call',     userId: 'sdr-001', text: 'Ligação de follow-up — TechSupply CE',         coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-006', createdAt: daysAgo(0) },
  { id: 'act-011', productId: 'wizmart',     type: 'whatsapp', userId: 'sdr-001', text: 'Reengajamento — DP Alimentos SP',              coinsAwarded: 0, wasOnTime: false, status: 'completed', cadenceType: 'sdr_daily',    dealId: 'deal-002', createdAt: daysAgo(0) },
  { id: 'act-012', productId: 'smart_cafe',  type: 'whatsapp', userId: 'sdr-002', text: 'WhatsApp enviado para Paulo Caffè',            coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-020', createdAt: daysAgo(0) },
  { id: 'act-013', productId: 'smart_cafe',  type: 'email',    userId: 'sdr-002', text: 'Email de proposta — Empório das Artes PR',     coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-022', createdAt: daysAgo(0) },
  { id: 'act-014', productId: 'smart_cafe',  type: 'meeting',  userId: 'sdr-002', text: 'Reunião de qualificação — Clínica Odonto SP',  coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-021', createdAt: daysAgo(0) },
  { id: 'act-015', productId: 'smart_cafe',  type: 'call',     userId: 'sdr-002', text: 'Ligação — Coffee Lovers SP',                  coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily',     dealId: 'deal-019', createdAt: daysAgo(0) },
  // Rep — visitas e propostas
  { id: 'act-016', productId: 'wizmart',     type: 'visit',    userId: 'rep-001', text: 'Visita realizada — Rede Master RS',            coinsAwarded: 2, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-009', createdAt: daysAgo(2) },
  { id: 'act-017', productId: 'wizmart',     type: 'meeting',  userId: 'rep-001', text: 'Apresentação de proposta — Santander SP',      coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-010', createdAt: daysAgo(3) },
  { id: 'act-018', productId: 'wizmart',     type: 'visit',    userId: 'rep-001', text: 'Visita técnica — Hospital Einstein SP',         coinsAwarded: 2, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-012', createdAt: daysAgo(1) },
  { id: 'act-019', productId: 'wizmart',     type: 'meeting',  userId: 'rep-001', text: 'Reunião contratual — WTC SP',                  coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-013', createdAt: daysAgo(2) },
  { id: 'act-020', productId: 'smart_cafe',  type: 'visit',    userId: 'rep-002', text: 'Visita técnica — HSL Hospital SP',             coinsAwarded: 2, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-026', createdAt: daysAgo(1) },
  { id: 'act-021', productId: 'smart_cafe',  type: 'meeting',  userId: 'rep-002', text: 'Apresentação de proposta — Estação Café BH',   coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-024', createdAt: daysAgo(3) },
  { id: 'act-022', productId: 'smart_cafe',  type: 'visit',    userId: 'rep-002', text: 'Visita — Ambev HQ Smart Café',                 coinsAwarded: 2, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup',  dealId: 'deal-025', createdAt: daysAgo(2) },
  // Pendentes (hoje)
  { id: 'act-023', productId: 'wizmart',     type: 'whatsapp', userId: 'sdr-001', text: 'Follow-up pendente — Horizonte MG',            coinsAwarded: 0, wasOnTime: true, status: 'pending',   cadenceType: 'sdr_daily',     dealId: 'deal-001', createdAt: daysAgo(0) },
  { id: 'act-024', productId: 'smart_cafe',  type: 'email',    userId: 'sdr-002', text: 'Email pendente — Padaria Central SC',          coinsAwarded: 0, wasOnTime: true, status: 'pending',   cadenceType: 'sdr_daily',     dealId: 'deal-020', createdAt: daysAgo(0) },
  // BDR
  { id: 'act-025', productId: 'wizmart',     type: 'whatsapp', userId: 'bdr-001', text: 'Prospecção — DP Alimentos SP',                coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-002', createdAt: daysAgo(4) },
  { id: 'act-026', productId: 'wizmart',     type: 'email',    userId: 'bdr-001', text: 'Email de prospecção — Horizonte MG',           coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-001', createdAt: daysAgo(5) },
  { id: 'act-027', productId: 'smart_cafe',  type: 'whatsapp', userId: 'bdr-002', text: 'Prospecção — Coffee Lovers SP',               coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'manual',        dealId: 'deal-019', createdAt: daysAgo(3) },
  { id: 'act-028', productId: 'wizmart',     type: 'note',     userId: 'rep-001', text: 'Nota interna — Jundiaí Shopping requer visita extra', coinsAwarded: 0, wasOnTime: true, status: 'completed', cadenceType: 'manual', dealId: 'deal-030', createdAt: daysAgo(1) },
];

// ── Templates de Playbook ─────────────────────────────────────────────────────
// As chaves de merge SÓ podem ser as que `EmailActionModal.tsx`/
// `WhatsAppActionModal.tsx` de fato constroem no `ctx` passado a
// `renderTemplate()`: contato, empresa, vendedor, negocio, valor, produto.
// Qualquer outro nome (ex.: {{companyName}}) fica literal na mensagem enviada
// — não existe fonte pra ele. Bug real encontrado em QA manual (13/09/2026):
// as 3 versões anteriores destes templates usavam nomes em inglês que nunca
// bateram com o contexto — toda mensagem enviada por eles saía com as tags
// {{...}} sem substituir.
const templates = [
  { id: 'tpl-001', name: 'Primeiro Email — WizMart',      funnelType: 'main',    productId: 'wizmart',    activityType: 'email',    role: 'sdr', subject: 'Olá {{contato}}, conheça o WizMart!', body: 'Olá {{contato}},\n\nA {{empresa}} pode transformar seu espaço em um minimarket de alto giro. Posso mostrar como em 20 minutos?\n\n{{vendedor}}', variables: ['contato','empresa','vendedor'], isActive: true, usageCount: 14 },
  { id: 'tpl-002', name: 'Confirmação de Visita — Rep',   funnelType: 'main',    productId: 'wizmart',    activityType: 'whatsapp', role: 'rep', body: 'Olá {{contato}}! 👋\nConfirmando nossa visita na {{empresa}}.\nQualquer dúvida estou à disposição! 🤝', variables: ['contato','empresa'], isActive: true, usageCount: 8 },
  { id: 'tpl-003', name: 'Proposta Smart Café — Pequeno', funnelType: 'main',    productId: 'smart_cafe', activityType: 'email',    role: 'rep', subject: 'Proposta Especial Smart Café — {{empresa}}', body: 'Prezado(a) {{contato}},\n\nSegue a proposta de comodato Smart Café personalizada para o seu negócio.\n\n{{vendedor}}', variables: ['contato','empresa','vendedor'], isActive: true, usageCount: 6 },
];

// ── Conquistas (achievements) ─────────────────────────────────────────────────
const achievements = [
  { id: 'first-contact',  icon: 'Zap',             name: 'Primeiro contato',    date: '12 mai', unlocked: true },
  { id: 'streak-5',       icon: 'Flame',           name: '5 dias seguidos',      date: '27 mai', unlocked: true },
  { id: 'pdv-5',          icon: 'Store',           name: '5 PDVs inaugurados',   date: '04 jun', unlocked: true },
  { id: 'meetings-10',    icon: 'Calendar',        name: '10 reuniões',           prog: 100,      unlocked: true },
  { id: 'handoff-10',     icon: 'ArrowRightLeft',  name: '10 handoffs',           prog: 60,       unlocked: false },
  { id: 'coins-100',      icon: 'Coins',           name: '100 moedas',            prog: 90,       unlocked: false },
];

// ── Prêmios da Loja ───────────────────────────────────────────────────────────
const prizes = [
  { id: 'prize-001', productId: 'wizmart', name: 'Voucher iFood R$ 50',    description: 'Voucher de R$ 50 no iFood.',    imageUrl: '', coinCost: 10, stock: -1, category: 'voucher',     isActive: true },
  { id: 'prize-002', productId: 'wizmart', name: 'Kit Home Office',         description: 'Mouse + Mousepad WizMart.',     imageUrl: '', coinCost: 25, stock:  5, category: 'produto',     isActive: true },
  { id: 'prize-003', productId: 'all',     name: 'Day Off',                 description: 'Um dia de folga remunerado.',   imageUrl: '', coinCost: 40, stock:  2, category: 'experiencia', isActive: true },
  { id: 'prize-004', productId: 'all',     name: 'Voucher Amazon R$ 100',   description: 'Voucher de R$ 100 na Amazon.', imageUrl: '', coinCost: 20, stock: -1, category: 'voucher',     isActive: true },
  { id: 'prize-005', productId: 'smart_cafe', name: 'Kit Barista Profissional', description: 'Moedor + tamper + dosador.', imageUrl: '', coinCost: 35, stock:  3, category: 'produto',  isActive: true },
];

// ── TV Links ──────────────────────────────────────────────────────────────────
const tvLinks = [
  { id: 'tv-demo', productId: 'all', token: 'demo-reception-token', created: '01 jun 2026', expires: '30 jun 2026', active: true, deviceName: 'Recepção WizMart SP', allowedMetrics: ['meta_pct','ganhos_hoje_count','tarefas','ranking_pontos','ranking_moedas','financeiro_real'] },
];

// ── Sellers (compat v1) ───────────────────────────────────────────────────────
const sellers = [
  { id: 'master-001',  name: 'Ricardo Master',   initials: 'RM', color: '#1A6B1A', pts: 3240, emails: 80, whats: 95, meetings: 30, level: 'Legend',  streak: 12, trend:  1, coinBalance: 145, productIds: ['wizmart','smart_cafe'] },
  { id: 'manager-001', name: 'Fernanda Gestora',  initials: 'FG', color: '#0E7490', pts: 2580, emails: 66, whats: 78, meetings: 22, level: 'Pro 2',   streak:  8, trend:  1, coinBalance: 112, productIds: ['wizmart','smart_cafe'] },
  { id: 'rep-001',     name: 'Carla Rep',         initials: 'CR', color: '#B91C1C', pts: 2760, emails: 71, whats: 65, meetings: 27, level: 'Pro 2',   streak: 15, trend:  1, coinBalance: 132, productIds: ['wizmart','smart_cafe'] },
  { id: 'rep-002',     name: 'Roberto Rep',       initials: 'RH', color: '#78350F', pts: 2290, emails: 58, whats: 54, meetings: 20, level: 'Pro 1',   streak:  9, trend:  1, coinBalance: 104, productIds: ['smart_cafe'] },
  { id: 'sdr-001',     name: 'João SDR',          initials: 'JS', color: '#B45309', pts: 2180, emails: 88, whats: 72, meetings: 23, level: 'Elite',   streak: 10, trend:  1, coinBalance:  98, productIds: ['wizmart','smart_cafe'] },
  { id: 'sdr-002',     name: 'Mariana SDR',       initials: 'MS', color: '#D97706', pts: 1640, emails: 55, whats: 50, meetings: 15, level: 'Pleno',   streak:  6, trend:  0, coinBalance:  72, productIds: ['smart_cafe'] },
  { id: 'bdr-001',     name: 'Lucas BDR',         initials: 'LB', color: '#7C3AED', pts: 1240, emails: 44, whats: 30, meetings: 12, level: 'Pleno',   streak:  5, trend:  0, coinBalance:  64, productIds: ['wizmart','smart_cafe'] },
  { id: 'bdr-002',     name: 'Daniela BDR',       initials: 'DB', color: '#EC4899', pts:  920, emails: 32, whats: 22, meetings:  7, level: 'Júnior',  streak:  3, trend: -1, coinBalance:  38, productIds: ['smart_cafe'] },
  { id: 'viewer-001',  name: 'Paulo Viewer',      initials: 'PV', color: '#4B5563', pts:  180, emails:  5, whats:  4, meetings:  1, level: 'Novato',  streak:  0, trend:  0, coinBalance:   5, productIds: ['wizmart','smart_cafe'] },
];

// ── Metas por usuário ─────────────────────────────────────────────────────────
const userGoals = [
  { id: 'sdr-001', userId: 'sdr-001', role: 'sdr', activitiesPerDay: 6, meetingsPerMonth: 10, updatedBy: 'manager-001' },
  { id: 'sdr-002', userId: 'sdr-002', role: 'sdr', activitiesPerDay: 5, meetingsPerMonth: 8,  updatedBy: 'manager-001' },
  { id: 'rep-001', userId: 'rep-001', role: 'rep', visitsPerMonth: 12, conquestsPerMonth: 3,  updatedBy: 'manager-001' },
  { id: 'rep-002', userId: 'rep-002', role: 'rep', visitsPerMonth: 10, conquestsPerMonth: 2,  updatedBy: 'manager-001' },
];

// ── Projetos de Layout ─────────────────────────────────────────────────────────
const projectRequests = [
  {
    id: 'proj-001', dealId: 'deal-003', companyName: 'WizDistribuidora SP',
    requestedBy: 'sdr-001', requestedByName: 'João SDR', requestedByRole: 'sdr',
    pdvTypes: ['micromarket'],
    quantities: { gondola: 4, fridge: 2, freezerVertical: 1, freezerHorizontal: 0, luminary: 2, sign: 1 },
    walls: { wall1: '4,50m x 2,80m', wall2: '3,20m x 2,80m', wall3: '' },
    notes: 'Preferência por tons verdes. Sem janelas na parede frontal.',
    mediaUrls: [], status: 'pending', assignedToDesignerId: null, deliveredFileUrl: null,
    requestedAt: daysAgo(3),
  },
  {
    id: 'proj-002', dealId: 'deal-009', companyName: 'Rede Master RS',
    requestedBy: 'rep-001', requestedByName: 'Carla Rep', requestedByRole: 'rep',
    pdvTypes: ['micromarket', 'container'],
    quantities: { gondola: 6, fridge: 3, freezerVertical: 2, freezerHorizontal: 1, luminary: 4, sign: 2 },
    walls: { wall1: '6,00m x 3,00m', wall2: '4,00m x 3,00m', wall3: '4,00m x 3,00m' },
    notes: 'Container externo com acesso independente. Sinalização externa obrigatória.',
    mediaUrls: [], status: 'in_progress', assignedToDesignerId: 'design-001', deliveredFileUrl: null,
    requestedAt: daysAgo(5),
  },
  {
    id: 'proj-003', dealId: 'deal-016', companyName: 'Conecta Log SP',
    requestedBy: 'rep-001', requestedByName: 'Carla Rep', requestedByRole: 'rep',
    pdvTypes: ['nanomarket'],
    quantities: { gondola: 2, fridge: 1, freezerVertical: 0, freezerHorizontal: 0, luminary: 1, sign: 1 },
    walls: { wall1: '2,50m x 2,60m', wall2: '2,50m x 2,60m', wall3: '' },
    notes: 'Espaço compacto no lobby do escritório. Layout clean.',
    mediaUrls: [], status: 'delivered', assignedToDesignerId: 'design-001',
    deliveredFileUrl: 'https://drive.google.com/file/d/demo-conecta-log-layout',
    requestedAt: daysAgo(15),
  },
  {
    id: 'proj-004', dealId: 'deal-017', companyName: 'Alphaville Residencial SP',
    requestedBy: 'rep-001', requestedByName: 'Carla Rep', requestedByRole: 'rep',
    pdvTypes: ['micromarket'],
    quantities: { gondola: 5, fridge: 2, freezerVertical: 1, freezerHorizontal: 1, luminary: 3, sign: 2 },
    walls: { wall1: '5,00m x 3,00m', wall2: '4,00m x 3,00m', wall3: '' },
    notes: 'Condomínio residencial premium. Visual moderno e clean.',
    mediaUrls: [], status: 'delivered', assignedToDesignerId: 'design-001',
    deliveredFileUrl: 'https://drive.google.com/file/d/demo-alphaville-layout',
    requestedAt: daysAgo(12),
  },
  {
    id: 'proj-005', dealId: 'deal-010', companyName: 'Santander Banco SP',
    requestedBy: 'rep-001', requestedByName: 'Carla Rep', requestedByRole: 'rep',
    pdvTypes: ['micromarket'],
    quantities: { gondola: 8, fridge: 4, freezerVertical: 2, freezerHorizontal: 0, luminary: 5, sign: 3 },
    walls: { wall1: '8,00m x 3,50m', wall2: '5,00m x 3,50m', wall3: '5,00m x 3,50m' },
    notes: 'Sede corporativa — 800 colaboradores. Alta rotatividade. Atender padrão de identidade Santander.',
    mediaUrls: [], status: 'pending', assignedToDesignerId: null, deliveredFileUrl: null,
    requestedAt: daysAgo(1),
  },
];

// ── Comissões (Fase 5.1 do PLANO_DESENHO_CRM.md) ─────────────────────────────
// deal-016 já está inaugurado com as 3 assinaturas (bdr-001/sdr-001/rep-001) —
// serve para o e2e de `/minha-comissao` provar, com dados reais passando pela
// query com `where(beneficiaryIds, array-contains, uid)` das rules, que o SDR
// e o Rep veem cada um só a própria fatia deste card.
const commissions = [
  {
    id: 'comm-001', dealId: 'deal-016', dealName: 'Distribuição Regional — Conecta Log',
    productId: 'wizmart', sku: 'wizmart_minimercado',
    faturamentoInformado: 3200, diasDecorridos: 12, baseCalculo: 3200, proporcional: false,
    split: { bdr: 64, sdr: 240, rep: 560, total: 864 },
    shares: [
      { role: 'bdr', userId: 'bdr-001', userName: 'Lucas BDR', valor: 64 },
      { role: 'sdr', userId: 'sdr-001', userName: 'João SDR', valor: 240, tier: 'junior' },
      { role: 'rep', userId: 'rep-001', userName: 'Carla Rep', valor: 560 },
    ],
    beneficiaryIds: ['bdr-001', 'sdr-001', 'rep-001'],
    dataAtivacao: '2026-06-15', dataPagamento: '2026-07-15',
    status: 'confirmada',
    createdAt: daysAgo(8),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertAuthUser(user) {
  try {
    await auth.updateUser(user.uid, { email: user.email, password: user.password, displayName: user.name, emailVerified: true, disabled: false });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid: user.uid, email: user.email, password: user.password, displayName: user.name, emailVerified: true, disabled: false });
  }
  await auth.setCustomUserClaims(user.uid, { tenantId, role: user.role, productIds: user.productIds });
}

async function setDocs(collectionPath, docs) {
  const batch = db.batch();
  for (const item of docs) {
    const { id, ...data } = item;
    batch.set(db.doc(`${collectionPath}/${id}`), { ...data, createdAt: data.createdAt || TS() }, { merge: true });
  }
  await batch.commit();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[seed v3] Criando usuários Auth...');
  for (const user of users) await upsertAuthUser(user);

  const base = `tenants/${tenantId}`;

  console.log('[seed v3] Populando Firestore...');
  await setDocs(`${base}/users`,            users.map(({ password, uid, ...u }) => ({ id: uid, uid, ...u })));
  await setDocs(`${base}/funnels`,          funnels);
  await setDocs(`${base}/stages`,           stages);
  await setDocs(`${base}/sellers`,          sellers);
  await setDocs(`${base}/deals`,            deals);
  await setDocs(`${base}/contacts`,         contacts);
  await setDocs(`${base}/companies`,        companies);
  await setDocs(`${base}/activity`,         activity);
  await setDocs(`${base}/activities`,       activity);
  await setDocs(`${base}/achievements`,     achievements);
  await setDocs(`${base}/templates`,        templates);
  await setDocs(`${base}/prizes`,           prizes);
  await setDocs(`${base}/tv_links`,         tvLinks);
  await setDocs(`${base}/user_goals`,       userGoals);
  await setDocs(`${base}/project_requests`, projectRequests);
  await setDocs(`${base}/commissions`,      commissions);

  // ── Realtime Database ────────────────────────────────────────────────────
  console.log('[seed v3] Populando Realtime Database...');

  const leaderboard = Object.fromEntries(
    sellers.map((s, i) => [s.id, { ...s, rank: i + 1 }])
  );

  // PDVs conquistados no mês: deal-016(2) + deal-017(3) + deal-018(2) + deal-027(2) + deal-028(1) + deal-029(2) = 12 WizMart + 5 SmartCafé = 17 total (mais 2 meses anteriores = 28)
  const liveKpis = {
    monthRevenue:          1518000,  // soma dos deals won (junho)
    monthGoal:             2000000,
    monthGoalPct:          75,
    todayDeals:            14,        // deals ativos movidos hoje
    todayRevenue:          310000,
    conquestsPdv:          12,        // PDVs inaugurados este mês: WizMart(7) + SmartCafé PDV(5) — deal-027 é comodato (R$)
    conquestsWizmart:       7,        // PDVs WizMart: deal-016(2)+deal-017(3)+deal-018(2)
    conquestsSmartCafePdv:  5,        // PDVs Smart Café: deal-028(1)+deal-029(2)+anteriores(2)
    conquestsComodato:  112000,       // R$ comodato Smart Café: deal-027 (Rede Caffè)
    installations:          6,        // deals em instalacao_agendada/instalacao_realizada this month
    prospectsShared:       18,        // deals com prospectsSharedMonth = MONTH
    activitiesGoal:        792,       // soma das metas: (6+5) * workdays ~= 36/dia * 22 dias
    activitiesActual:       29,       // completed hoje
    visitsScheduled:       12,        // deals com visitScheduledMonth = MONTH
    visitsScheduledByState: { SP: 8, RJ: 5, MG: 2, PR: 2, RS: 1, SC: 1, DF: 1, PA: 1, BA: 1 },
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  };

  await rtdb.ref(`tenants/${tenantId}/leaderboard`).set(leaderboard);
  await rtdb.ref(`tenants/${tenantId}/live_kpis`).set(liveKpis);

  // TV pública
  await rtdb.ref('public_tv/demo-reception-token').set({
    tenantId,
    tenantName: 'WizMart Distribuidora SP',
    expiresAt: '30 jun 2026',
    // Demo: todas as métricas liberadas para validar o display completo.
    allowedMetrics: ['meta_pct', 'ganhos_hoje_count', 'tarefas', 'ranking_pontos', 'ranking_moedas', 'financeiro_real'],
    live_kpis: liveKpis,
    sellers: sellers.slice(0, 5).map((s, i) => ({
      name: s.name,
      initials: s.initials,
      color: s.color,
      val:  [348000, 203000, 112000, 148000, 96000][i],
      pct:  [100,     58,     32,     43,     28][i],
      pts:  s.pts,
    })),
    tasks: { done: 24, total: 35 },
    leaderboard,
  });

  // ── Resumo ────────────────────────────────────────────────────────────────
  const won     = deals.filter(d => d.status === 'won');
  const pdvs    = won.reduce((s, d) => s + (d.conquestValue || 0), 0);
  const wmWon   = won.filter(d => d.funnelId === 'wizmart');
  const scWon   = won.filter(d => d.funnelId === 'smart_cafe');

  console.log(`\n✅ Seed v3 concluído`);
  console.log(`   projectId=${projectId}  tenantId=${tenantId}`);
  console.log(`\n   📦 Deals: ${deals.length} total`);
  console.log(`      WizMart:    ${deals.filter(d=>d.funnelId==='wizmart').length} deals  (${wmWon.length} won)`);
  console.log(`      Smart Café: ${deals.filter(d=>d.funnelId==='smart_cafe').length} deals  (${scWon.length} won)`);
  console.log(`      PDVs inaugurados: ${pdvs}`);
  console.log(`\n   📋 Atividades: ${activity.length}`);
  console.log(`   🎨 Projetos:   ${projectRequests.length}`);
  console.log('\n   Contas (senha: senha_de_teste_123):');
  for (const u of users) console.log(`   ${u.role.padEnd(8)} → ${u.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[seed] Erro:', e); process.exit(1); });
