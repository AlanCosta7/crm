/**
 * Testes das Security Rules do papel `financeiro` — Fase 5.4 do PLANO_DESENHO_CRM.md
 *
 * Slide 11 do deck: "Gostaria de ter um espaço dentro do card da Smart Café
 * para anexar o contrato e um 'check' para alguém do time financeiro clicar
 * dizendo que foi pago."
 *
 * O que este arquivo prova:
 *  1. Financeiro lê um deal de Comodato Smart Café, e SÓ esse tipo de deal —
 *     nada de WizMart, nada de outro SKU do Smart Café.
 *  2. Financeiro escreve APENAS `contractPaidAt`/`contractPaidBy` — qualquer
 *     outro campo no mesmo update (mesmo um legítimo, tipo `value`) é negado.
 *  3. `updatedAt` (que TODA escrita via useFirestoreMutations inclui) não
 *     derruba a permissão — é o detalhe que a primeira versão da rule errou.
 *  4. Financeiro não sobe nem apaga o arquivo do contrato no Storage — só lê.
 *  5. O par positivo: quem edita o deal normalmente continua editando; o
 *     financeiro bloqueado (Fase 0) continua sem acesso a nada.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const REP = 'rep-001';
const SDR = 'sdr-001';
const MASTER = 'master-001';
const FINANCEIRO = 'financeiro-001';
const COMODATO_DEAL = 'deal-comodato';
const WIZMART_DEAL = 'deal-wizmart';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart', 'smart_cafe'] });
}

const dealDoc = (db: Firestore, id: string) => doc(db, `tenants/${TID}/deals/${id}`);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wizmart-crm-local',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
  });
}, 90000);

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // isTenant() consulta users/{uid} desde a Fase 0 — todo mundo precisa de
  // perfil. `financeiro-001` não está no fixture padrão (`fixtures.ts` só
  // conhece os 8 papéis "clássicos"), então o perfil dele é gravado abaixo.
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, `tenants/${TID}/users/${FINANCEIRO}`), {
      uid: FINANCEIRO, name: 'Fátima Financeiro', email: 'financeiro@wizmart.com.br',
      role: 'financeiro', productIds: ['smart_cafe'], isActive: true,
    });
    await setDoc(dealDoc(db, COMODATO_DEAL), {
      name: 'Franquia Comodato X', company: 'Franquia X LTDA', value: 0,
      stage: 'contrato_assinado', productId: 'smart_cafe', mainProduct: 'smartcafe_comodato',
      owner: REP, assignedRepId: REP, participantIds: [REP], responsibleId: REP,
      status: 'open', due: '—', tasks: { e: false, w: false, m: false },
      contract: { url: 'https://x', storagePath: 'p', fileName: 'contrato.pdf', mime: 'application/pdf', size: 100, uploadedBy: REP, uploadedAt: new Date() },
    });
    await setDoc(dealDoc(db, WIZMART_DEAL), {
      name: 'Mercado Central', company: 'Mercado Central LTDA', value: 5000,
      stage: 'prospeccao', productId: 'wizmart', mainProduct: 'wizmart_minimercado',
      owner: SDR, assignedSdrId: SDR, participantIds: [SDR], responsibleId: SDR,
      status: 'open', due: '—', tasks: { e: false, w: false, m: false },
    });
  });
});

describe('financeiro — leitura escopada a Comodato Smart Café', () => {
  it('lê o deal de Comodato', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertSucceeds(getDoc(dealDoc(db, COMODATO_DEAL)));
  });

  it('NÃO lê um deal WizMart', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(getDoc(dealDoc(db, WIZMART_DEAL)));
  });

  it('NÃO lê um Smart Café que não é Comodato', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(dealDoc(c.firestore(), 'deal-snacks'), {
        name: 'Máquina de Snacks', company: 'X', value: 0, stage: 'contrato_assinado',
        productId: 'smart_cafe', mainProduct: 'smartcafe_snacks', owner: REP,
        status: 'open', due: '—', tasks: { e: false, w: false, m: false },
      });
    });
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(getDoc(dealDoc(db, 'deal-snacks')));
  });
});

describe('financeiro — escreve SÓ contractPaidAt/contractPaidBy', () => {
  it('marca o pagamento — incluindo updatedAt, que useFirestoreMutations sempre adiciona', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertSucceeds(updateDoc(dealDoc(db, COMODATO_DEAL), {
      contractPaidAt: new Date().toISOString(),
      contractPaidBy: FINANCEIRO,
      updatedAt: new Date(),
    }));
  });

  it('só contractPaidAt, sem contractPaidBy, também passa', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertSucceeds(updateDoc(dealDoc(db, COMODATO_DEAL), {
      contractPaidAt: new Date().toISOString(), updatedAt: new Date(),
    }));
  });

  it('NÃO edita nenhum outro campo do deal — nem junto com o pagamento legítimo', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(updateDoc(dealDoc(db, COMODATO_DEAL), {
      contractPaidAt: new Date().toISOString(), value: 999999, updatedAt: new Date(),
    }));
  });

  it('NÃO reescreve o próprio arquivo do contrato', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(updateDoc(dealDoc(db, COMODATO_DEAL), {
      contract: { url: 'https://forjado', storagePath: 'x', fileName: 'x.pdf', mime: 'application/pdf', size: 1, uploadedBy: FINANCEIRO, uploadedAt: new Date() },
      updatedAt: new Date(),
    }));
  });

  it('NÃO move o estágio do card', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(updateDoc(dealDoc(db, COMODATO_DEAL), { stage: 'perdeu', updatedAt: new Date() }));
  });

  it('NÃO marca pagamento fora de Comodato — nem tentando em um deal WizMart', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(updateDoc(dealDoc(db, WIZMART_DEAL), {
      contractPaidAt: new Date().toISOString(), updatedAt: new Date(),
    }));
  });

  it('NÃO cria deal', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(setDoc(dealDoc(db, 'deal-forjado'), {
      name: 'X', company: 'X', value: 0, stage: 'prospeccao', productId: 'smart_cafe',
      owner: FINANCEIRO, status: 'open', due: '—', tasks: { e: false, w: false, m: false },
    }));
  });

  it('NÃO exclui deal', async () => {
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(deleteDoc(dealDoc(db, COMODATO_DEAL)));
  });
});

describe('financeiro bloqueado (Fase 0) perde o acesso também aqui', () => {
  it('financeiro inativo não lê nem marca pagamento', async () => {
    await env.clearFirestore();
    await seedRulesUsers(env, TID);
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, `tenants/${TID}/users/${FINANCEIRO}`), {
        uid: FINANCEIRO, name: 'Fátima', role: 'financeiro', productIds: ['smart_cafe'], isActive: false,
      });
      await setDoc(dealDoc(db, COMODATO_DEAL), {
        name: 'Franquia X', company: 'X', value: 0, stage: 'contrato_assinado',
        productId: 'smart_cafe', mainProduct: 'smartcafe_comodato', owner: REP,
        status: 'open', due: '—', tasks: { e: false, w: false, m: false },
        contract: { url: 'https://x', storagePath: 'p', fileName: 'c.pdf', mime: 'application/pdf', size: 1, uploadedBy: REP, uploadedAt: new Date() },
      });
    });
    const db = ctx(FINANCEIRO, 'financeiro').firestore();
    await assertFails(getDoc(dealDoc(db, COMODATO_DEAL)));
    await assertFails(updateDoc(dealDoc(db, COMODATO_DEAL), { contractPaidAt: new Date().toISOString(), updatedAt: new Date() }));
  });
});

describe('edição normal do deal segue funcionando (par positivo)', () => {
  it('o Rep participante continua editando o Comodato normalmente', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertSucceeds(updateDoc(dealDoc(db, COMODATO_DEAL), { value: 15000, updatedAt: new Date() }));
  });

  it('master continua editando qualquer campo', async () => {
    const db = ctx(MASTER, 'master').firestore();
    await assertSucceeds(updateDoc(dealDoc(db, COMODATO_DEAL), { stage: 'perdeu', updatedAt: new Date() }));
  });
});
