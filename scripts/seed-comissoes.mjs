/**
 * Seed Comissões — WizMart CRM
 *
 * Popula um cenário completo para a feature de Comissão (Fases 1-4):
 *  - define o nível de comissão (commissionTier) dos SDRs
 *  - cria negócios inaugurados/instalados cobrindo cada modelo de comissão
 *  - cria documentos em `commissions` em vários status e 2 ciclos de pagamento
 *
 * É idempotente: usa IDs fixos (merge/set), então rodar de novo apenas atualiza.
 *
 * A lógica de rateio abaixo espelha src/features/comissoes/calc.ts (mantida
 * inline para o script ser self-contained, no padrão dos demais seeds).
 *
 * Uso (com emuladores rodando):  node scripts/seed-comissoes.mjs
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin   = require('../functions/node_modules/firebase-admin');

const IS_PROD = process.env.SEED_TARGET === 'prod';

const projectId = process.env.GCLOUD_PROJECT
  || (IS_PROD ? 'codifyx7' : (process.env.VITE_FIREBASE_PROJECT_ID || 'demo-wizmart-crm-local'));
const tenantId  = 'wizmart_sp';

if (IS_PROD) {
  console.log('⚠️  SEED_TARGET=prod — escrevendo em PRODUÇÃO:', projectId);
  admin.initializeApp({ projectId, credential: admin.credential.applicationDefault() });
} else {
  process.env.FIREBASE_AUTH_EMULATOR_HOST     = process.env.FIREBASE_AUTH_EMULATOR_HOST     || '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST         = process.env.FIRESTORE_EMULATOR_HOST         || '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
  admin.initializeApp({ projectId });
}
const db = admin.firestore();
const col = (name) => db.collection('tenants').doc(tenantId).collection(name);

// ── Tabelas de comissão (espelho de calc.ts) ───────────────────────────────────
const STANDARD = { bdr: 0.02, sdr: { junior: 0.075, pleno: 0.0875, senior: 0.10 }, rep: 0.175 };
const CAFE     = { bdr: 0.02, sdr: 0.21, rep: 0.49 };
const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

function calcularSplit(model, base, sdrTier) {
  if (model === 'cafe') {
    const bdr = round(base * CAFE.bdr), sdr = round(base * CAFE.sdr), rep = round(base * CAFE.rep);
    return { bdr, sdr, rep, total: round(bdr + sdr + rep) };
  }
  const bdr = round(base * STANDARD.bdr);
  const sdr = round(base * STANDARD.sdr[sdrTier ?? 'junior']);
  const rep = round(base * STANDARD.rep);
  return { bdr, sdr, rep, total: round(bdr + sdr + rep) };
}

// Comodato: parcelas com teto fixo (regra do cliente). Ex.: 23k, teto 5k → 4x5k + 3k.
const COMODATO_TETO = 5000;
function parcelarPorTeto(total, teto = COMODATO_TETO) {
  if (total <= 0 || teto <= 0) return [];
  const out = [];
  let restante = round(total), numero = 1;
  while (restante > 0) {
    const valor = restante > teto ? teto : restante;
    out.push({ numero, valor: round(valor) });
    restante = round(restante - valor);
    numero++;
  }
  return out;
}

// dia 15 do mês seguinte ao da ativação (UTC)
function dataPagamento(isoAtivacao) {
  const d = new Date(isoAtivacao);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15)).toISOString();
}

// ── Pessoas (uids já existentes no seed principal) ──────────────────────────────
const P = {
  bdr1: { id: 'bdr-001', name: 'Lucas BDR' },
  sdr1: { id: 'sdr-001', name: 'João SDR',     tier: 'pleno'  },
  rep1: { id: 'rep-001', name: 'Carla Rep' },
  bdr2: { id: 'bdr-002', name: 'Daniela BDR' },
  sdr2: { id: 'sdr-002', name: 'Mariana SDR',  tier: 'senior' },
  rep2: { id: 'rep-002', name: 'Roberto Rep' },
};

// ── Negócios inaugurados/instalados p/ comissão ─────────────────────────────────
const deals = [
  { id: 'com-deal-1', name: 'Minimercado Bairro Alto',  company: 'Bairro Alto Ltda',   mainProduct: 'wizmart_minimercado',  productId: 'wizmart',    bdr: P.bdr1, sdr: P.sdr1, rep: P.rep1 },
  { id: 'com-deal-2', name: 'Snacks Faculdade Centro',  company: 'Centro Educacional',  mainProduct: 'smartcafe_snacks',     productId: 'smart_cafe', bdr: P.bdr2, sdr: P.sdr2, rep: P.rep2 },
  { id: 'com-deal-3', name: 'Café Hospital Norte',      company: 'Hospital Norte SA',   mainProduct: 'smartcafe_venda_direta', productId: 'smart_cafe', bdr: P.bdr2, sdr: P.sdr1, rep: P.rep2 },
  { id: 'com-deal-4', name: 'Comodato Indústria Sul',   company: 'Indústria Sul SA',    mainProduct: 'smartcafe_comodato',   productId: 'smart_cafe', bdr: P.bdr2, sdr: P.sdr2, rep: P.rep1 },
];

// Negócios ativados no mês anterior AINDA SEM comissão — alimentam a fila de
// avaliação do dia 10 (Cloud Function commissionEvaluationQueue).
const PRIOR_MONTH = '2026-05';
const CICLO_ATUAL = '2026-06';
const dealsPendentes = [
  { id: 'com-deal-5', name: 'Minimercado Vila Nova',  company: 'Vila Nova Mercados', mainProduct: 'wizmart_minimercado', productId: 'wizmart',    bdr: P.bdr1, sdr: P.sdr1, rep: P.rep1 },
  { id: 'com-deal-6', name: 'Café Escritório Leste',  company: 'Leste Corporate',    mainProduct: 'smartcafe_venda_direta', productId: 'smart_cafe', bdr: P.bdr2, sdr: P.sdr2, rep: P.rep2 },
];

// ── Comissões a criar (cobrem modelos, status e 2 ciclos) ───────────────────────
// ativ. em 31/mai → paga 15/jun ; ativ. em 28/jun → paga 15/jul
const cenarios = [
  {
    id: 'com-1', deal: deals[0], model: 'standard', sku: 'wizmart_minimercado',
    ativacao: '2026-05-31T00:00:00Z', faturamento: 1000, dias: 10, proporcional: true,
    status: 'projetada', obs: 'Projeção dia 10: 1k em 10 dias → 3k (acima do gatilho).',
  },
  {
    id: 'com-2', deal: deals[1], model: 'standard', sku: 'smartcafe_snacks',
    ativacao: '2026-05-31T00:00:00Z', faturamento: 2400, dias: 30, proporcional: false,
    status: 'confirmada', obs: 'Snacks bateu 2k de gatilho no período cheio.',
  },
  {
    id: 'com-3', deal: deals[2], model: 'cafe', sku: 'smartcafe_venda_direta',
    ativacao: '2026-05-31T00:00:00Z', faturamento: 1200, dias: 30, proporcional: false,
    tabelaCheia: true, status: 'paga', obs: 'Café com tabela cheia → 72%.',
  },
  {
    id: 'com-4', deal: deals[3], model: 'standard', sku: 'smartcafe_comodato',
    ativacao: '2026-06-28T00:00:00Z', faturamento: 80000, dias: 1, proporcional: false,
    primeiraFaturaPaga: true, tetoParcela: COMODATO_TETO, status: 'confirmada',
    obs: 'Comodato: base de contrato 80k → comissão parcelada com teto de 5k.',
  },
  // Segundo minimercado, ciclo jul, já pago — para o relatório ter histórico
  {
    id: 'com-5', deal: deals[0], model: 'standard', sku: 'wizmart_minimercado',
    ativacao: '2026-06-28T00:00:00Z', faturamento: 3500, dias: 30, proporcional: false,
    status: 'paga', obs: 'Mês cheio acima do gatilho.',
  },
];

async function run() {
  console.log(`\nSeed Comissões → tenant ${tenantId} (projeto ${projectId})\n`);
  const batch = db.batch();

  // 1) Tiers dos SDRs (merge para não apagar o restante do doc)
  batch.set(col('users').doc(P.sdr1.id), { commissionTier: P.sdr1.tier }, { merge: true });
  batch.set(col('users').doc(P.sdr2.id), { commissionTier: P.sdr2.tier }, { merge: true });
  console.log(`  • Tiers: ${P.sdr1.name}=${P.sdr1.tier}, ${P.sdr2.name}=${P.sdr2.tier}`);

  // 2) Negócios
  for (const d of deals) {
    batch.set(col('deals').doc(d.id), {
      name: d.name, company: d.company, value: 0,
      stage: d.mainProduct === 'smartcafe_comodato' ? 'instalacao_realizada' : 'inaugurado',
      funnelId: d.productId, funnelType: 'main', productId: d.productId, mainProduct: d.mainProduct,
      owner: d.rep.id, bdrId: d.bdr.id, assignedSdrId: d.sdr.id, assignedRepId: d.rep.id,
      tasks: { e: true, w: true, m: true },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`  • ${deals.length} negócios inaugurados/instalados`);

  // 2b. Negócios pendentes de avaliação (ativados no mês anterior, sem comissão)
  for (const d of dealsPendentes) {
    batch.set(col('deals').doc(d.id), {
      name: d.name, company: d.company, value: 0,
      stage: d.mainProduct === 'smartcafe_comodato' ? 'instalacao_realizada' : 'inaugurado',
      funnelId: d.productId, funnelType: 'main', productId: d.productId, mainProduct: d.mainProduct,
      owner: d.rep.id, bdrId: d.bdr.id, assignedSdrId: d.sdr.id, assignedRepId: d.rep.id,
      tasks: { e: true, w: true, m: true },
      cohortKeys: { conquestMonth: PRIOR_MONTH },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // 2c. Fila de avaliação do ciclo (simula a saída da Cloud Function do dia 10)
  const nomes = { [P.bdr1.id]: P.bdr1.name, [P.sdr1.id]: P.sdr1.name, [P.rep1.id]: P.rep1.name,
                  [P.bdr2.id]: P.bdr2.name, [P.sdr2.id]: P.sdr2.name, [P.rep2.id]: P.rep2.name };
  const filaItems = dealsPendentes.map((d) => ({
    dealId: d.id, dealName: d.name, company: d.company, sku: d.mainProduct, productId: d.productId,
    bdrId: d.bdr.id, bdrName: nomes[d.bdr.id],
    sdrId: d.sdr.id, sdrName: nomes[d.sdr.id], sdrTier: d.sdr.tier ?? null,
    repId: d.rep.id, repName: nomes[d.rep.id],
  }));
  batch.set(col('commission_queues').doc(CICLO_ATUAL), {
    cicloKey: CICLO_ATUAL, priorMonth: PRIOR_MONTH, count: filaItems.length, items: filaItems,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`  • Fila de avaliação ${CICLO_ATUAL}: ${filaItems.length} pendente(s)`);

  // 3) Comissões
  for (const c of cenarios) {
    const sdrTier = c.deal.sdr.tier ?? 'junior';
    const split = calcularSplit(c.model, c.faturamento, sdrTier);
    const projetado = c.proporcional ? round((c.faturamento / c.dias) * 30) : undefined;
    const shares = [
      { role: 'bdr', userId: c.deal.bdr.id, userName: c.deal.bdr.name, valor: split.bdr },
      { role: 'sdr', userId: c.deal.sdr.id, userName: c.deal.sdr.name, tier: sdrTier, valor: split.sdr },
      { role: 'rep', userId: c.deal.rep.id, userName: c.deal.rep.name, valor: split.rep },
    ];
    const parcelas = c.tetoParcela ? parcelarPorTeto(split.total, c.tetoParcela) : [];

    const doc = {
      dealId: c.deal.id, dealName: c.deal.name, productId: c.deal.productId, sku: c.sku,
      faturamentoInformado: c.faturamento, diasDecorridos: c.dias,
      faturamentoProjetado: projetado ?? null,
      baseCalculo: c.faturamento,
      tabelaCheia: c.tabelaCheia ?? null,
      primeiraFaturaPaga: c.primeiraFaturaPaga ?? null,
      proporcional: c.proporcional,
      split, shares, beneficiaryIds: shares.map((s) => s.userId),
      parcelas: parcelas.length ? parcelas : null,
      dataAtivacao: c.ativacao, dataPagamento: dataPagamento(c.ativacao),
      status: c.status, observacao: c.obs, createdBy: 'manager-001',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    batch.set(col('commissions').doc(c.id), doc, { merge: true });
    console.log(`  • ${c.id.padEnd(7)} ${c.sku.padEnd(24)} total=${split.total.toFixed(2).padStart(9)}  status=${c.status}`);
  }

  await batch.commit();
  console.log(`\n✓ Seed de comissões concluído (${cenarios.length} comissões em 2 ciclos: jun e jul/2026).\n`);
}

run().catch((e) => { console.error('Falha no seed de comissões:', e); process.exit(1); });
