/**
 * audit-user-claims-drift.mjs — Levanta as divergências entre o documento do
 * usuário e as custom claims do token, ANTES de deployar a Fase 0.
 *
 * Por que isso importa: até a CF `onUserProfileWritten` entrar no ar, papel e
 * produtos gravados na tela de administração nunca chegaram às claims. Quem
 * tem documento e token discordando MUDA DE PERMISSÃO no instante em que a
 * function é deployada — para mais ou para menos. Este script mostra quem, e o
 * que vai acontecer com cada um, para a mudança ser avisada e não descoberta.
 *
 * SOMENTE LEITURA. Não escreve nada, em lugar nenhum — nem no Firestore, nem
 * no Auth. Pode rodar em produção com tranquilidade.
 *
 * Requer credenciais de admin (ADC):
 *   gcloud auth application-default login
 *
 * Uso:
 *   node scripts/qa/audit-user-claims-drift.mjs
 *   TENANT_ID=wizmart_sp node scripts/qa/audit-user-claims-drift.mjs
 *   node scripts/qa/audit-user-claims-drift.mjs --all-tenants
 *   node scripts/qa/audit-user-claims-drift.mjs --emulator   # aponta pros emuladores (usado no teste)
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const ALL_TENANTS = process.argv.includes('--all-tenants');
// Sem esta flag o script SEMPRE fala com produção — apontar para o emulador é
// uma escolha explícita, nunca um resto de variável de ambiente esquecida.
const EMULADOR = process.argv.includes('--emulator');
const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantIdArg = process.env.TENANT_ID || 'wizmart';

if (EMULADOR) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9098';
  console.log('⚙️  modo emulador');
} else {
  // Nunca apontar para emulador sem querer — por padrão isto lê produção.
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

const app = admin.initializeApp({ projectId }, `audit-${Date.now()}`);
const db = app.firestore();
const auth = app.auth();

const VALID_ROLES = ['master', 'manager', 'bdr', 'sdr', 'rep', 'design', 'viewer'];

/** Mesma decisão de `functions/src/users/userClaimsRules.ts`. */
function papelDesejado(role) {
  return typeof role === 'string' && VALID_ROLES.includes(role) ? role : 'viewer';
}

function listaIgual(a, b) {
  const sa = [...(Array.isArray(a) ? a : [])].sort();
  const sb = [...(Array.isArray(b) ? b : [])].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

async function auditarTenant(tenantId) {
  const snap = await db.collection(`tenants/${tenantId}/users`).get();
  if (snap.empty) {
    console.log(`\n(${tenantId}) nenhum usuário encontrado.`);
    return { total: 0, divergentes: 0, semConta: 0 };
  }

  console.log(`\n═══ Tenant ${tenantId} — ${snap.size} usuário(s) ═══`);

  let divergentes = 0;
  let semConta = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const uid = doc.id;
    const nome = d.name || d.email || uid;

    let rec;
    try {
      rec = await auth.getUser(uid);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        semConta++;
        console.log(`⚠️  ${nome} (${uid}) — perfil SEM conta no Auth; a CF vai ignorar este documento.`);
        continue;
      }
      throw e;
    }

    const claims = rec.customClaims || {};
    const desejado = {
      role: papelDesejado(d.role),
      productIds: Array.isArray(d.productIds) && d.productIds.length ? d.productIds : ['wizmart'],
    };
    const bloqueioDesejado = d.isActive === false;

    const problemas = [];

    if (claims.role !== desejado.role) {
      const efeito = claims.role === 'master' ? ' ⬇️ PERDE acesso de master'
        : desejado.role === 'master' ? ' ⬆️ GANHA acesso de master' : '';
      problemas.push(`papel: token='${claims.role ?? '(sem claim)'}' → documento='${desejado.role}'${efeito}`);
    }
    if (!listaIgual(claims.productIds, desejado.productIds)) {
      problemas.push(`produtos: token=[${(claims.productIds || []).join(',')}] → documento=[${desejado.productIds.join(',')}]`);
    }
    if (claims.tenantId !== tenantId) {
      problemas.push(`tenant: token='${claims.tenantId ?? '(sem claim)'}' → '${tenantId}'`);
    }
    if (rec.disabled !== bloqueioDesejado) {
      problemas.push(bloqueioDesejado
        ? "isActive=false no documento, mas a conta está ATIVA no Auth → vai ser BLOQUEADA e a sessão encerrada"
        : "conta desabilitada no Auth, mas isActive não é false no documento → vai ser REABILITADA");
    }
    if (d.role && !VALID_ROLES.includes(d.role)) {
      problemas.push(`papel inválido no documento ('${d.role}') → cairá em 'viewer'`);
    }

    if (problemas.length) {
      divergentes++;
      console.log(`\n🔴 ${nome} (${uid})`);
      for (const p of problemas) console.log(`     · ${p}`);
      console.log('     → a sessão dele será encerrada no deploy (precisa entrar de novo)');
    }
  }

  const mastersAtivos = snap.docs.filter(
    x => x.data().role === 'master' && x.data().isActive !== false,
  ).length;
  console.log(`\n   masters ativos no documento: ${mastersAtivos}`);
  if (mastersAtivos === 0) {
    console.log('   🔴 ATENÇÃO: nenhum master ativo neste tenant — resolver ANTES do deploy.');
  }

  return { total: snap.size, divergentes, semConta };
}

const tenants = ALL_TENANTS
  ? (await db.collection('tenants').get()).docs.map(d => d.id)
  : [tenantIdArg];

let totalDiv = 0;
for (const tid of tenants) {
  const r = await auditarTenant(tid);
  totalDiv += r.divergentes;
}

console.log('\n' + '─'.repeat(60));
console.log(totalDiv === 0
  ? '✅ Nenhuma divergência: o deploy da Fase 0 não muda a permissão de ninguém.'
  : `⚠️  ${totalDiv} usuário(s) mudam de permissão no deploy — avisar antes de subir.`);
console.log('Este script não alterou nada.');
process.exit(0);
