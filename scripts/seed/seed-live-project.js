/**
 * Seed Live Project — WizMart CRM
 * Popula a base real de homologação (Firestore, RTDB e Auth) com dados mockados de teste.
 *
 * Uso: node scripts/seed/seed-live-project.js
 * (requer autenticação prévia via gcloud auth application-default login ou chave de conta de serviço)
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'codifyx7';
const tenantId  = 'wizmart_sp';

// Garante que não usaremos emuladores acidentalmente
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;

// Inicializa o admin sem setar emuladores
const app = admin.initializeApp({
  projectId,
});

// Ativa logs do RTDB para ajudar a identificar problemas de conexão
admin.database.enableLogging(true);

const db   = app.firestore();
const auth = app.auth();
let rtdb;
const TS   = admin.firestore.FieldValue.serverTimestamp;

// ── Usuários — todos os 6 roles ───────────────────────────────────────────────
const users = [
  {
    uid: 'master-001',
    email: 'master@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'master',
    name: 'Ricardo Master',
    initials: 'RM',
    color: '#1A6B1A',
    points: 2450,
    coinBalance: 120,
    streak: 8,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'manager-001',
    email: 'manager@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'manager',
    name: 'Fernanda Gestora',
    initials: 'FG',
    color: '#0E7490',
    points: 1980,
    coinBalance: 95,
    streak: 5,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'bdr-001',
    email: 'bdr@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'bdr',
    name: 'Lucas BDR',
    initials: 'LB',
    color: '#7C3AED',
    points: 890,
    coinBalance: 45,
    streak: 3,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'sdr-001',
    email: 'sdr@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'sdr',
    name: 'João SDR',
    initials: 'JS',
    color: '#B45309',
    points: 1670,
    coinBalance: 78,
    streak: 7,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'rep-001',
    email: 'rep@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'rep',
    name: 'Carla Rep',
    initials: 'CR',
    color: '#B91C1C',
    points: 2100,
    coinBalance: 110,
    streak: 12,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'viewer-001',
    email: 'viewer@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'viewer',
    name: 'Paulo Viewer',
    initials: 'PV',
    color: '#4B5563',
    points: 150,
    coinBalance: 5,
    streak: 0,
    productIds: ['wizmart', 'smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  // Assessores específicos de Smart Café para Leaderboard e segmentação
  {
    uid: 'sdr-002',
    email: 'sdr2@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'sdr',
    name: 'Mariana SDR (Café)',
    initials: 'MS',
    color: '#D97706',
    points: 1120,
    coinBalance: 52,
    streak: 4,
    productIds: ['smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'rep-002',
    email: 'rep2@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'rep',
    name: 'Roberto Rep (Café)',
    initials: 'RH',
    color: '#78350F',
    points: 1850,
    coinBalance: 88,
    streak: 6,
    productIds: ['smart_cafe'],
    calendarConnected: false,
    isActive: true,
  },
  {
    uid: 'bdr-002',
    email: 'bdr2@wizmart.com.br',
    password: 'senha_de_teste_123',
    role: 'bdr',
    name: 'Daniela BDR (Café)',
    initials: 'DB',
    color: '#EC4899',
    points: 750,
    coinBalance: 30,
    streak: 2,
    productIds: ['smart_cafe'],
    calendarConnected: false,
    isActive: true,
  }
];

// ── Funis v2 ─────────────────────────────────────────────────────────────────
const funnels = [
  // --- WizMart Funnels ---
  {
    id: 'inbound-wizmart',
    name: 'Inbound — WizMart',
    type: 'inbound',
    productId: 'wizmart',
    color: '#1A6B1A',
    isActive: true,
    stages: [
      { id: 'lead_recebido',       name: 'Lead Recebido',        order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#E5F0E5' },
      { id: 'qualif_sdr',          name: 'Qualificação SDR',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#D1E7DD' },
      { id: 'interesse_confirmado',name: 'Interesse Confirmado', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#BAD4BA' },
      { id: 'visita_agendada',     name: 'Visita Agendada',      order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#8DB600' },
    ],
  },
  {
    id: 'outbound-wizmart',
    name: 'Outbound — WizMart',
    type: 'outbound',
    productId: 'wizmart',
    color: '#8DB600',
    isActive: true,
    stages: [
      { id: 'prospect_id',   name: 'Prospect Identificado', order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FFFFF0' },
      { id: 'primeiro_cont', name: 'Primeiro Contato',       order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FEFCE8' },
      { id: 'int_confirmado',name: 'Interesse Confirmado',   order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FEF9C3' },
      { id: 'visita_out',    name: 'Visita Agendada',        order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#FDE047' },
    ],
  },
  {
    id: 'hunter-wizmart',
    name: 'Hunter — WizMart',
    type: 'hunter',
    productId: 'wizmart',
    color: '#B91C1C',
    isActive: true,
    stages: [
      { id: 'visita_ag_h',   name: 'Visita Agendada',     order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FEE2E2' },
      { id: 'visita_real',   name: 'Visita Realizada',    order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FECACA' },
      { id: 'proposta_ap',   name: 'Proposta Apresentada',order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FCA5A5' },
      { id: 'negociacao',    name: 'Negociação',          order: 4, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 7, defaultTemplateIds: [], color: '#F87171' },
      { id: 'contrato',      name: 'Contrato Assinado',   order: 5, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#EF4444' },
      { id: 'pdv_ativo',     name: 'PDV Ativo',           order: 6, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 3, slaBusinessDays: 0, defaultTemplateIds: [], color: '#DC2626' },
    ],
  },
  // --- Smart Café Funnels ---
  {
    id: 'inbound-smart_cafe',
    name: 'Inbound — Smart Café',
    type: 'inbound',
    productId: 'smart_cafe',
    color: '#5E3A26',
    isActive: true,
    stages: [
      { id: 'lead_recebido_c',       name: 'Lead Recebido',        order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FAF2EC' },
      { id: 'qualif_sdr_c',          name: 'Qualificação SDR',     order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FDF7F2' },
      { id: 'interesse_confirmado_c',name: 'Interesse Confirmado', order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#EADFD9' },
      { id: 'visita_agendada_c',     name: 'Visita Agendada',      order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#D4A373' },
    ],
  },
  {
    id: 'outbound-smart_cafe',
    name: 'Outbound — Smart Café',
    type: 'outbound',
    productId: 'smart_cafe',
    color: '#D4A373',
    isActive: true,
    stages: [
      { id: 'prospect_id_c',   name: 'Prospect Identificado', order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 1, defaultTemplateIds: [], color: '#FAF2EC' },
      { id: 'primeiro_cont_c', name: 'Primeiro Contato',       order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 2, defaultTemplateIds: [], color: '#FDF7F2' },
      { id: 'int_confirmado_c',name: 'Interesse Confirmado',   order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 3, defaultTemplateIds: [], color: '#EADFD9' },
      { id: 'visita_out_c',    name: 'Visita Agendada',        order: 4, isConvergencePoint: true,  isHandoffRequired: true,  coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#D4A373' },
    ],
  },
  {
    id: 'hunter-smart_cafe',
    name: 'Hunter — Smart Café',
    type: 'hunter',
    productId: 'smart_cafe',
    color: '#5E3A26',
    isActive: true,
    stages: [
      { id: 'visita_ag_h_c',   name: 'Visita Agendada',     order: 1, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 3, defaultTemplateIds: [], color: '#FAF2EC' },
      { id: 'visita_real_c',   name: 'Visita Realizada',    order: 2, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#FDF7F2' },
      { id: 'proposta_ap_c',   name: 'Proposta Apresentada',order: 3, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 5, defaultTemplateIds: [], color: '#EADFD9' },
      { id: 'negociacao_c',    name: 'Negociação',          order: 4, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 0, slaBusinessDays: 7, defaultTemplateIds: [], color: '#D4A373' },
      { id: 'contrato_c',      name: 'Contrato Assinado',   order: 5, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 1, slaBusinessDays: 0, defaultTemplateIds: [], color: '#5E3A26' },
      { id: 'pdv_ativo_c',     name: 'PDV Ativo',           order: 6, isConvergencePoint: false, isHandoffRequired: false, coinsOnEnter: 3, slaBusinessDays: 0, defaultTemplateIds: [], color: '#2C1A10' },
    ],
  }
];

// ── Estágios legados (compatibilidade v1) ─────────────────────────────────────
const stages = [
  { id: 'prospec',  name: 'Prospecção' },
  { id: 'qualif',   name: 'Qualificação' },
  { id: 'proposta', name: 'Proposta' },
  { id: 'negoc',    name: 'Negociação' },
  { id: 'fecham',   name: 'Fechamento' },
];

// ── Deals com campo productId ─────────────────────────────────────────────────
const deals = [
  // --- WizMart Deals ---
  {
    id: 'deal-001',
    name: 'Contrato Anual — WizDistribuidora',
    company: 'WizDistribuidora SP',
    value: 156000,
    stage: 'qualif_sdr',
    funnelId: 'outbound-wizmart',
    funnelType: 'outbound',
    productId: 'wizmart',
    owner: 'sdr-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-15',
    status: 'open',
    tasks: { e: true, w: true, m: false },
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-03T14:30:00Z'
  },
  {
    id: 'deal-002',
    name: 'Expansão Loja 3 — Grupo Meridian',
    company: 'Grupo Meridian Atacado',
    value: 87000,
    stage: 'visita_real',
    funnelId: 'hunter-wizmart',
    funnelType: 'hunter',
    productId: 'wizmart',
    owner: 'rep-001',
    assignedRepId: 'rep-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-18',
    status: 'open',
    tasks: { e: true, w: false, m: false },
    createdAt: '2026-05-20T11:00:00Z',
    updatedAt: '2026-06-02T16:20:00Z'
  },
  {
    id: 'deal-003',
    name: 'Renovação Trimestral — TechSupply',
    company: 'TechSupply Nordeste',
    value: 42800,
    stage: 'qualif_sdr',
    funnelId: 'outbound-wizmart',
    funnelType: 'outbound',
    productId: 'wizmart',
    owner: 'sdr-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-10',
    status: 'open',
    tasks: { e: false, w: false, m: false },
    createdAt: '2026-06-02T09:00:00Z',
    updatedAt: '2026-06-02T09:00:00Z'
  },
  {
    id: 'deal-004',
    name: 'Distribuição Regional — Conecta Log',
    company: 'Conecta Log Ltda',
    value: 203000,
    stage: 'pdv_ativo',
    funnelId: 'hunter-wizmart',
    funnelType: 'hunter',
    productId: 'wizmart',
    owner: 'rep-001',
    assignedRepId: 'rep-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-05-29',
    status: 'won',
    tasks: { e: true, w: true, m: true },
    createdAt: '2026-05-10T08:00:00Z',
    updatedAt: '2026-06-04T17:45:00Z'
  },
  {
    id: 'deal-006',
    name: 'Atacarejo Sul — Rede Master',
    company: 'Rede Master RS',
    value: 310000,
    stage: 'proposta_ap',
    funnelId: 'hunter-wizmart',
    funnelType: 'hunter',
    productId: 'wizmart',
    owner: 'rep-001',
    assignedRepId: 'rep-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-25',
    status: 'open',
    tasks: { e: true, w: true, m: false },
    createdAt: '2026-05-18T14:00:00Z',
    updatedAt: '2026-06-03T11:15:00Z'
  },
  {
    id: 'deal-007',
    name: 'Abastecimento Norte — AgroBrasil',
    company: 'AgroBrasil PA',
    value: 125000,
    stage: 'interesse_confirmado',
    funnelId: 'inbound-wizmart',
    funnelType: 'inbound',
    productId: 'wizmart',
    owner: 'sdr-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-20',
    status: 'open',
    tasks: { e: true, w: true, m: true },
    createdAt: '2026-06-03T13:20:00Z',
    updatedAt: '2026-06-04T15:10:00Z'
  },
  {
    id: 'deal-008',
    name: 'Franquia Centro — SulLog',
    company: 'SulLog Distribuidora DF',
    value: 75000,
    stage: 'lead_recebido',
    funnelId: 'inbound-wizmart',
    funnelType: 'inbound',
    productId: 'wizmart',
    owner: 'bdr-001',
    assignedSdrId: 'sdr-001',
    bdrId: 'bdr-001',
    due: '2026-06-12',
    status: 'in_queue',
    tasks: { e: false, w: false, m: false },
    createdAt: '2026-06-04T16:50:00Z',
    updatedAt: '2026-06-04T16:50:00Z'
  },

  // --- Smart Café Deals ---
  {
    id: 'deal-005',
    name: 'Grãos Premium — Padaria Central',
    company: 'Padaria Central SC',
    value: 18500,
    stage: 'qualif_sdr_c',
    funnelId: 'inbound-smart_cafe',
    funnelType: 'inbound',
    productId: 'smart_cafe',
    owner: 'sdr-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-15',
    status: 'open',
    tasks: { e: true, w: false, m: false },
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-02T10:15:00Z'
  },
  {
    id: 'deal-009',
    name: 'Máquinas de Espresso — Bistrô Paris',
    company: 'Bistrô Paris RJ',
    value: 45000,
    stage: 'visita_real_c',
    funnelId: 'hunter-smart_cafe',
    funnelType: 'hunter',
    productId: 'smart_cafe',
    owner: 'rep-002',
    assignedRepId: 'rep-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-22',
    status: 'open',
    tasks: { e: true, w: true, m: false },
    createdAt: '2026-05-22T14:30:00Z',
    updatedAt: '2026-06-04T11:00:00Z'
  },
  {
    id: 'deal-010',
    name: 'Fornecimento Anual — Rede Caffè',
    company: 'Rede Caffè SP',
    value: 112000,
    stage: 'pdv_ativo_c',
    funnelId: 'hunter-smart_cafe',
    funnelType: 'hunter',
    productId: 'smart_cafe',
    owner: 'rep-002',
    assignedRepId: 'rep-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-05-30',
    status: 'won',
    tasks: { e: true, w: true, m: true },
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-06-03T16:30:00Z'
  },
  {
    id: 'deal-011',
    name: 'Franquia Caramelo — Estação Café',
    company: 'Estação Café BH',
    value: 68000,
    stage: 'proposta_ap_c',
    funnelId: 'hunter-smart_cafe',
    funnelType: 'hunter',
    productId: 'smart_cafe',
    owner: 'rep-002',
    assignedRepId: 'rep-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-19',
    status: 'open',
    tasks: { e: true, w: false, m: false },
    createdAt: '2026-05-25T11:30:00Z',
    updatedAt: '2026-06-03T14:00:00Z'
  },
  {
    id: 'deal-012',
    name: 'Lote Gourmet — Empório das Artes',
    company: 'Empório das Artes PR',
    value: 29000,
    stage: 'interesse_confirmado_c',
    funnelId: 'inbound-smart_cafe',
    funnelType: 'inbound',
    productId: 'smart_cafe',
    owner: 'sdr-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-14',
    status: 'open',
    tasks: { e: true, w: true, m: true },
    createdAt: '2026-06-02T15:00:00Z',
    updatedAt: '2026-06-04T09:30:00Z'
  },
  {
    id: 'deal-013',
    name: 'Filtros & Acessórios — Coffee Lovers',
    company: 'Coffee Lovers SP',
    value: 12000,
    stage: 'lead_recebido_c',
    funnelId: 'inbound-smart_cafe',
    funnelType: 'inbound',
    productId: 'smart_cafe',
    owner: 'bdr-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-18',
    status: 'in_queue',
    tasks: { e: false, w: false, m: false },
    createdAt: '2026-06-04T14:20:00Z',
    updatedAt: '2026-06-04T14:20:00Z'
  },
  {
    id: 'deal-014',
    name: 'Parceria OCS — Consultório Odonto',
    company: 'Clínica Odonto SP',
    value: 9500,
    stage: 'primeiro_cont_c',
    funnelId: 'outbound-smart_cafe',
    funnelType: 'outbound',
    productId: 'smart_cafe',
    owner: 'sdr-002',
    assignedSdrId: 'sdr-002',
    bdrId: 'bdr-002',
    due: '2026-06-11',
    status: 'open',
    tasks: { e: true, w: false, m: false },
    createdAt: '2026-06-03T10:00:00Z',
    updatedAt: '2026-06-04T11:45:00Z'
  }
];

// ── Contatos ──────────────────────────────────────────────────────────────────
const contacts = [
  {
    id: 'carlos-mendes',
    name: 'Carlos Mendes',
    role: 'Diretor de Compras',
    company: 'WizDistribuidora SP',
    email: 'carlos.mendes@wizdist.com.br',
    phone: '(11) 98823-4501',
    whats: '(11) 98823-4501',
    owner: 'sdr-001',
    last: 'há 2 horas',
    tags: ['Decisor', 'VIP'],
    deals: 1,
    productIds: ['wizmart'],
  },
  {
    id: 'ana-meridian',
    name: 'Ana Silveira',
    role: 'Gerente Comercial',
    company: 'Grupo Meridian Atacado',
    email: 'ana.silveira@meridian.com.br',
    phone: '(21) 99712-8830',
    whats: '(21) 99712-8830',
    owner: 'rep-001',
    last: 'ontem',
    tags: ['Influenciador'],
    deals: 1,
    productIds: ['wizmart'],
  },
  {
    id: 'paulo-cafes',
    name: 'Paulo Caffè',
    role: 'Sócio Proprietário',
    company: 'Rede Caffè SP',
    email: 'paulo.caffe@redecaffe.com.br',
    phone: '(11) 97722-1133',
    whats: '(11) 97722-1133',
    owner: 'sdr-002',
    last: 'há 3 horas',
    tags: ['Decisor'],
    deals: 1,
    productIds: ['smart_cafe'],
  },
  {
    id: 'luciana-paris',
    name: 'Luciana Dupont',
    role: 'Gerente de A&B',
    company: 'Bistrô Paris RJ',
    email: 'luciana@bistroparis.com.br',
    phone: '(21) 98311-2244',
    whats: '(21) 98311-2244',
    owner: 'rep-002',
    last: 'há 1 dia',
    tags: ['VIP'],
    deals: 1,
    productIds: ['smart_cafe'],
  }
];

// ── Empresas ──────────────────────────────────────────────────────────────────
const companies = [
  { id: 'wizdistribuidora-sp',    name: 'WizDistribuidora SP',    segment: 'Distribuição', deals: 1, value: 156000, productIds: ['wizmart'] },
  { id: 'grupo-meridian-atacado', name: 'Grupo Meridian Atacado', segment: 'Atacado',      deals: 1, value: 87000,  productIds: ['wizmart'] },
  { id: 'techsupply-nordeste',    name: 'TechSupply Nordeste',    segment: 'Distribuição', deals: 1, value: 42800,  productIds: ['wizmart'] },
  { id: 'conecta-log-ltda',       name: 'Conecta Log Ltda',       segment: 'Logística',    deals: 1, value: 203000, productIds: ['wizmart'] },
  { id: 'rede-master-rs',         name: 'Rede Master RS',         segment: 'Atacarejo',    deals: 1, value: 310000, productIds: ['wizmart'] },
  { id: 'agrobrasil-pa',          name: 'AgroBrasil PA',          segment: 'Agronegócio',  deals: 1, value: 125000, productIds: ['wizmart'] },
  { id: 'sullog-df',              name: 'SulLog Distribuidora DF',segment: 'Logística',    deals: 1, value: 75000,  productIds: ['wizmart'] },
  
  { id: 'padaria-central-sc',     name: 'Padaria Central SC',     segment: 'Alimentação',  deals: 1, value: 18500,  productIds: ['smart_cafe'] },
  { id: 'bistro-paris-rj',        name: 'Bistrô Paris RJ',        segment: 'Restaurante',  deals: 1, value: 45000,  productIds: ['smart_cafe'] },
  { id: 'rede-caffe-sp',          name: 'Rede Caffè SP',          segment: 'Cafeteria',    deals: 1, value: 112000, productIds: ['smart_cafe'] },
  { id: 'estacao-cafe-bh',        name: 'Estação Café BH',        segment: 'Cafeteria',    deals: 1, value: 68000,  productIds: ['smart_cafe'] },
  { id: 'emporio-artes-pr',       name: 'Empório das Artes PR',   segment: 'Empório',      deals: 1, value: 29000,  productIds: ['smart_cafe'] },
  { id: 'coffee-lovers-sp',       name: 'Coffee Lovers SP',       segment: 'Cafeteria',    deals: 1, value: 12000,  productIds: ['smart_cafe'] },
  { id: 'clinica-odonto-sp',      name: 'Clínica Odonto SP',      segment: 'Saúde',        deals: 1, value: 9500,   productIds: ['smart_cafe'] }
];

// ── Activities ────────────────────────────────────────────────────────────────
const activity = [
  { id: 'act-001', productId: 'wizmart', type: 'win',      userId: 'rep-001',  who: 'rep-001',  text: 'fechou o negócio Conecta Log', val: 'R$ 203.000', time: 'há 35 min', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'manual' },
  { id: 'act-002', productId: 'wizmart', type: 'whatsapp', userId: 'sdr-001',  who: 'sdr-001',  text: 'enviou WhatsApp para Carlos Mendes', time: 'há 1 hora', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily' },
  { id: 'act-003', productId: 'wizmart', type: 'email',    userId: 'sdr-001',  who: 'sdr-001',  text: 'enviou email de proposta para TechSupply', time: 'ontem', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily' },
  { id: 'act-004', productId: 'wizmart', type: 'meeting',  userId: 'rep-001',  who: 'rep-001',  text: 'agendou reunião com Grupo Meridian', time: 'ontem', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup' },
  
  { id: 'act-005', productId: 'smart_cafe', type: 'win',      userId: 'rep-002', who: 'rep-002', text: 'fechou o negócio Rede Caffè', val: 'R$ 112.000', time: 'há 2 horas', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'manual' },
  { id: 'act-006', productId: 'smart_cafe', type: 'whatsapp', userId: 'sdr-002', who: 'sdr-002', text: 'enviou WhatsApp para Paulo Caffè', time: 'há 3 horas', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'sdr_daily' },
  { id: 'act-007', productId: 'smart_cafe', type: 'meeting',  userId: 'rep-002', who: 'rep-002', text: 'realizou visita técnica no Bistrô Paris', time: 'ontem', coinsAwarded: 1, wasOnTime: true, status: 'completed', cadenceType: 'rep_followup' }
];

// ── Templates de Playbook ─────────────────────────────────────────────────────
const templates = [
  {
    id: 'tpl-001',
    name: 'Primeiro Email — Inbound',
    funnelType: 'inbound',
    activityType: 'email',
    role: 'sdr',
    subject: 'Olá {{contactFirstName}}, vimos que você tem interesse em {{productName}}!',
    body: `Olá {{contactFirstName}}, tudo bem?\n\nIdentifiquei que sua empresa ({{companyName}}) pode se beneficiar muito da nossa solução {{productName}}.\n\nGostaria de agendar 20 minutos para apresentar como estamos ajudando empresas como a sua a crescer.\n\nFico à disposição!\n\nAbraços,\n{{userName}}`,
    variables: ['contactFirstName', 'companyName', 'productName', 'userName'],
    isActive: true,
    usageCount: 0,
  },
  {
    id: 'tpl-002',
    name: 'Confirmação de Visita — Hunter',
    funnelType: 'hunter',
    activityType: 'whatsapp',
    role: 'rep',
    body: `Olá {{contactFirstName}}! 👋\n\nPassando para confirmar nossa visita {{visitDate}} às {{visitTime}}.\n\nEstarei em {{companyName}} para apresentar {{productName}}.\n\nQualquer dúvida, estou aqui! 🤝`,
    variables: ['contactFirstName', 'visitDate', 'visitTime', 'companyName', 'productName'],
    isActive: true,
    usageCount: 0,
  },
];

// ── Conquistas ────────────────────────────────────────────────────────────────
const achievements = [
  { id: 'first-contact',  icon: 'Zap',      name: 'Primeiro contato', date: '12 mai', unlocked: true },
  { id: 'streak-5',       icon: 'Flame',     name: '5 dias seguidos',  date: '27 mai', unlocked: true },
  { id: 'meetings-10',    icon: 'Calendar',  name: '10 reuniões',      prog: 80,       unlocked: false },
  { id: 'handoff-10',     icon: 'ArrowRightLeft', name: '10 handoffs', prog: 30,       unlocked: false },
  { id: 'coins-50',       icon: 'Coins',     name: '50 moedas',        prog: 84,       unlocked: false },
];

// ── Prêmios da Loja ───────────────────────────────────────────────────────────
const prizes = [
  { id: 'prize-001', productId: 'wizmart', name: 'Voucher iFood R$ 50',    description: 'Voucher de R$ 50 no iFood.',      imageUrl: '', coinCost: 10, stock: -1, category: 'voucher',    isActive: true },
  { id: 'prize-002', productId: 'wizmart', name: 'Kit Home Office',         description: 'Mouse + Mousepad WizMart.',       imageUrl: '', coinCost: 25, stock: 5,  category: 'produto',    isActive: true },
  { id: 'prize-003', productId: 'all',     name: 'Day Off',                 description: 'Um dia de folga remunerado.',     imageUrl: '', coinCost: 40, stock: 2,  category: 'experiencia', isActive: true },
  { id: 'prize-004', productId: 'all',     name: 'Voucher Amazon R$ 100',   description: 'Voucher de R$ 100 na Amazon.',   imageUrl: '', coinCost: 20, stock: -1, category: 'voucher',    isActive: true },
];

// ── TV Links ──────────────────────────────────────────────────────────────────
const tvLinks = [
  { id: 'tv-demo', productId: 'all', token: 'demo-reception-token', created: '29 mai 2026', expires: '29 jun 2026', active: true, deviceName: 'Recepção WizMart SP', allowedMetrics: ['meta_pct', 'ganhos_hoje_count', 'tarefas', 'ranking_pontos'] },
];

// ── Sellers (compatibilidade v1) ──────────────────────────────────────────────
const sellers = [
  { id: 'master-001',  name: 'Ricardo Master',   initials: 'RM', color: '#1A6B1A', pts: 2450, emails: 68, whats: 82, meetings: 24, level: 'Pro 2',    streak: 8, trend:  0, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'manager-001', name: 'Fernanda Gestora',  initials: 'FG', color: '#0E7490', pts: 1980, emails: 54, whats: 68, meetings: 18, level: 'Pro 1',    streak: 5, trend:  1, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'sdr-001',     name: 'João SDR',          initials: 'JS', color: '#B45309', pts: 1670, emails: 79, whats: 64, meetings: 19, level: 'Elite',    streak: 7, trend:  1, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'rep-001',     name: 'Carla Rep',         initials: 'CR', color: '#B91C1C', pts: 2100, emails: 65, whats: 58, meetings: 22, level: 'Pro 2',    streak: 12, trend:  1, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'bdr-001',     name: 'Lucas BDR',         initials: 'LB', color: '#7C3AED', pts: 890,  emails: 38, whats: 25, meetings: 10, level: 'Júnior',   streak: 3, trend:  0, productIds: ['wizmart', 'smart_cafe'] },
  { id: 'sdr-002',     name: 'Mariana SDR (Café)', initials: 'MS', color: '#D97706', pts: 1120, emails: 48, whats: 44, meetings: 12, level: 'Pleno',    streak: 4, trend:  0, productIds: ['smart_cafe'] },
  { id: 'rep-002',     name: 'Roberto Rep (Café)', initials: 'RH', color: '#78350F', pts: 1850, emails: 50, whats: 49, meetings: 16, level: 'Pro 1',    streak: 6, trend:  1, productIds: ['smart_cafe'] },
  { id: 'bdr-002',     name: 'Daniela BDR (Café)', initials: 'DB', color: '#EC4899', pts: 750,  emails: 28, whats: 19, meetings:  6, level: 'Júnior',   streak: 2, trend: -1, productIds: ['smart_cafe'] },
  { id: 'viewer-001',  name: 'Paulo Viewer',      initials: 'PV', color: '#4B5563', pts: 150,  emails:  5, whats:  4, meetings:  1, level: 'Novato',   streak: 0, trend:  0, productIds: ['wizmart', 'smart_cafe'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    batch.set(db.doc(`${collectionPath}/${id}`), { ...data, createdAt: TS() }, { merge: true });
  }
  await batch.commit();
}

async function main() {
  console.log('[seed] Criando usuários Auth...');
  for (const user of users) await upsertAuthUser(user);

  const base = `tenants/${tenantId}`;

  console.log('[seed] Populando Firestore...');
  await setDocs(`${base}/users`,        users.map(({ password, uid, ...u }) => ({ id: uid, uid, ...u })));
  await setDocs(`${base}/funnels`,      funnels);
  await setDocs(`${base}/stages`,       stages);
  await setDocs(`${base}/sellers`,      sellers);
  await setDocs(`${base}/deals`,        deals);
  await setDocs(`${base}/contacts`,     contacts);
  await setDocs(`${base}/companies`,    companies);
  await setDocs(`${base}/activity`,     activity);
  await setDocs(`${base}/activities`,   activity);
  await setDocs(`${base}/achievements`, achievements);
  await setDocs(`${base}/templates`,    templates);
  await setDocs(`${base}/prizes`,       prizes);
  await setDocs(`${base}/tv_links`,     tvLinks);

  console.log('[seed] Populando Realtime Database...');
  const leaderboard = Object.fromEntries(sellers.map((s, i) => [s.id, { ...s, rank: i + 1, coinBalance: [120, 95, 78, 110, 45, 52, 88, 30, 5][i] }]));

  // Helper com timeout para evitar travamentos infinitos e fornecer feedback claro ao usuário
  const runWithTimeout = (promise, ms, description) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout de ${ms}ms atingido durante: ${description}.`));
      }, ms);
    });
    return Promise.race([
      promise.then((res) => { clearTimeout(timeoutId); return res; }),
      timeoutPromise
    ]);
  };

  const candidateUrls = [
    'https://crm-codifyx.firebaseio.com',
    `https://${projectId}-default-rtdb.firebaseio.com`,
    `https://${projectId}.firebaseio.com`,
    'https://crm-codifyx.southamerica-east1.firebasedatabase.app',
  ];

  console.log('[seed] Localizando e testando conexões com as instâncias candidatas do Realtime Database...');
  let successUrl = null;

  for (const url of candidateUrls) {
    try {
      console.log(`   Testando conexão com: ${url} ...`);
      const dbInstance = app.database(url);
      
      // Tenta fazer uma escrita rápida de teste
      await runWithTimeout(
        dbInstance.ref('test_connection').set({ timestamp: Date.now() }),
        3000,
        `Teste de escrita em ${url}`
      );
      
      console.log(`   ✅ Conexão bem-sucedida com: ${url}`);
      rtdb = dbInstance;
      successUrl = url;
      
      // Limpa a chave de teste
      await dbInstance.ref('test_connection').remove();
      break;
    } catch (e) {
      console.log(`   ❌ Falha ao conectar/gravar em ${url}: ${e.message || e}`);
    }
  }

  if (!rtdb) {
    console.error('\n❌ Não foi possível conectar a nenhuma instância do Realtime Database.');
    console.log('\n⚠️ Dicas de Resolução:');
    console.log('1. Certifique-se de que autenticou corretamente sua CLI/ambiente local executando:');
    console.log('   gcloud auth application-default login');
    console.log('2. Verifique se o Realtime Database está ativo no console do Firebase do projeto "codifyx7".');
    console.log('3. Verifique se a sua conta tem a permissão "Administrador do Firebase Realtime Database" (ou "Editor/Dono" do projeto).');
    process.exit(1);
  }

  try {
    console.log(`   Enviando leaderboard para o Realtime Database (${successUrl})...`);
    await runWithTimeout(
      rtdb.ref(`tenants/${tenantId}/leaderboard`).set(leaderboard),
      8000,
      'Gravação do Leaderboard'
    );

    console.log('   Enviando live KPIs para o Realtime Database...');
    await runWithTimeout(
      rtdb.ref(`tenants/${tenantId}/live_kpis`).set({
        monthRevenue: 847500,
        monthGoal: 1200000,
        todayDeals: 7,
        todayRevenue: 84200,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      }),
      8000,
      'Gravação dos Live KPIs'
    );

    console.log('   Enviando dados do link da TV para o Realtime Database...');
    await runWithTimeout(
      rtdb.ref('public_tv/demo-reception-token').set({
        tenantId,
        tenantName: 'WizMart Distribuidora SP',
        expiresAt: '29 jun 2026',
        live_kpis: { monthRevenue: 847500, monthGoal: 1200000, todayDeals: 7, todayRevenue: 84200 },
        sellers: sellers.slice(0, 3).map((s, i) => ({ name: s.name, val: [203000, 156000, 87000][i], pct: [100, 77, 43][i] })),
        tasks: { done: 83, total: 120 },
        leaderboard,
      }),
      8000,
      'Gravação do Public TV Link'
    );
  } catch (error) {
    console.error('\n❌ Erro ao popular Realtime Database:', error.message || error);
    process.exit(1);
  }

  console.log(`\n✅ Seed Live concluído — projectId=${projectId}, tenantId=${tenantId}`);
  console.log('   Contas disponíveis (senha: senha_de_teste_123):');
  for (const u of users) console.log(`   ${u.role.padEnd(8)} → ${u.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[seed] Erro:', e); process.exit(1); });
