/**
 * test-contract-reminder-emulator.mjs — Valida a Fase 5.4 do PLANO_DESENHO_CRM.md.
 *
 * Testa as duas buscas que alimentam o e-mail do dia 09
 * (`functions/src/comissoes/contractReminderEmail.ts`) direto contra o
 * Firestore emulado, sem precisar de SMTP nem do emulador de functions —
 * `pendenciasDoTenant`/`financeirosAtivos` são funções puras de I/O,
 * exportadas só para este teste.
 *
 * Uso: npm run test:contract-reminder
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

let pendenciasDoTenant, financeirosAtivos;
try {
  ({ pendenciasDoTenant, financeirosAtivos } = require('../../functions/lib/comissoes/contractReminderEmail.js'));
} catch {
  console.error('Não encontrei functions/lib/comissoes/contractReminderEmail.js.');
  console.error('Rode primeiro: npm --prefix functions run build');
  process.exit(1);
}

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

const contrato = { url: 'https://storage/contrato.pdf' };

await db.doc(`tenants/${TENANT}/deals/comodato-pendente`).set({
  company: 'Franquia Pendente', name: 'Comodato Pendente', mainProduct: 'smartcafe_comodato',
  contract: contrato,
});
await db.doc(`tenants/${TENANT}/deals/comodato-pago`).set({
  company: 'Franquia Paga', name: 'Comodato Pago', mainProduct: 'smartcafe_comodato',
  contract: contrato, contractPaidAt: '2026-06-15T00:00:00.000Z',
});
await db.doc(`tenants/${TENANT}/deals/comodato-sem-contrato`).set({
  company: 'Franquia Sem PDF', name: 'Comodato Sem Contrato', mainProduct: 'smartcafe_comodato',
});
await db.doc(`tenants/${TENANT}/deals/wizmart-com-campo-contract`).set({
  // Mesmo que por engano tivesse um `contract`, WizMart nunca é pendência de comodato.
  company: 'Mercado X', name: 'Deal WizMart', mainProduct: 'wizmart_minimercado', contract: contrato,
});

const pendencias = await pendenciasDoTenant(db, TENANT);
report(pendencias.length === 1, 'só o comodato com contrato e sem pagamento entra na lista',
  `${pendencias.length} pendência(s): ${pendencias.map(p => p.company).join(', ')}`);
report(pendencias[0]?.company === 'Franquia Pendente', 'é exatamente a Franquia Pendente');
report(pendencias[0]?.contractUrl === contrato.url, 'traz a URL do contrato para o link do e-mail');

await db.doc(`tenants/${TENANT}/users/fin-ativo`).set({
  name: 'Fátima Ativa', email: 'fatima@wizmart.com.br', role: 'financeiro', isActive: true,
});
await db.doc(`tenants/${TENANT}/users/fin-bloqueado`).set({
  name: 'Bloqueado', email: 'bloqueado@wizmart.com.br', role: 'financeiro', isActive: false,
});
await db.doc(`tenants/${TENANT}/users/fin-sem-email`).set({
  name: 'Sem Email', role: 'financeiro', isActive: true,
});
await db.doc(`tenants/${TENANT}/users/rep-nao-financeiro`).set({
  name: 'Rep', email: 'rep@wizmart.com.br', role: 'rep', isActive: true,
});

const financeiros = await financeirosAtivos(db, TENANT);
report(financeiros.length === 1, 'só o financeiro ativo e com e-mail entra na lista de destinatários',
  `${financeiros.length} destinatário(s): ${financeiros.map(f => f.email).join(', ')}`);
report(financeiros[0]?.id === 'fin-ativo', 'é exatamente o fin-ativo');

console.log(allOk ? '\n🎉 Fase 5.4 (busca do lembrete) validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
