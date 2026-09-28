/**
 * Testes das Security Rules de Storage do contrato de Comodato Smart Café
 * (Fase 5.4 do PLANO_DESENHO_CRM.md).
 *
 * O que este arquivo prova:
 *  1. Papel operacional (rep) sobe um PDF dentro do limite.
 *  2. Arquivo que não é PDF, ou que passa do limite, é negado.
 *  3. `financeiro` NUNCA sobe nem substitui o arquivo — só lê. É o motivo de
 *     `isOperational` ter passado a excluir `financeiro` (ver firestore.rules).
 *  4. Qualquer membro do tenant lê (financeiro precisa; os demais também podem).
 *  5. O objeto é imutável: subir de novo no MESMO caminho é negado — é por
 *     isso que `contractStoragePath` inclui um `attachmentId` novo a cada envio.
 *  6. Delete é só do master.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const REP = 'rep-001';
const FINANCEIRO = 'financeiro-001';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart', 'smart_cafe'] });
}

const contractPath = (dealId = 'deal-comodato', attId = 'att-1', file = 'contrato.pdf') =>
  `tenants/${TID}/deals/${dealId}/contract/${attId}/${file}`;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const meta = (ownerUid: string) => ({ contentType: 'application/pdf', customMetadata: { ownerUid } });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wizmart-crm-local',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9198,
    },
  });
}, 90000);

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `tenants/${TID}/users/${FINANCEIRO}`), {
      uid: FINANCEIRO, name: 'Fátima Financeiro', role: 'financeiro', productIds: ['smart_cafe'], isActive: true,
    });
  });
});

describe('contrato — upload pelo lado operacional', () => {
  it('rep sobe um PDF dentro do limite', async () => {
    const st = ctx(REP, 'rep').storage();
    await assertSucceeds(uploadBytes(ref(st, contractPath()), PDF, meta(REP)));
  });

  it('rejeita arquivo que não é PDF', async () => {
    const st = ctx(REP, 'rep').storage();
    await assertFails(uploadBytes(ref(st, contractPath()), PDF, { contentType: 'text/plain', customMetadata: { ownerUid: REP } }));
  });

  it('rejeita acima de 15MB', async () => {
    const st = ctx(REP, 'rep').storage();
    const grande = new Uint8Array(15 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(st, contractPath()), grande, meta(REP)));
  });

  it('rejeita quando o ownerUid do metadata não bate com quem está logado', async () => {
    const st = ctx(REP, 'rep').storage();
    await assertFails(uploadBytes(ref(st, contractPath()), PDF, meta('outro-uid')));
  });
});

describe('contrato — financeiro só lê, nunca escreve', () => {
  it('financeiro NÃO sobe o contrato', async () => {
    const st = ctx(FINANCEIRO, 'financeiro').storage();
    await assertFails(uploadBytes(ref(st, contractPath()), PDF, meta(FINANCEIRO)));
  });

  it('financeiro lê o contrato já enviado', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), contractPath()), PDF, meta(REP));
    });
    const st = ctx(FINANCEIRO, 'financeiro').storage();
    await assertSucceeds(getBytes(ref(st, contractPath())));
  });
});

describe('contrato — objeto imutável', () => {
  it('subir de novo no MESMO caminho (mesmo attachmentId) é negado', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), contractPath()), PDF, meta(REP));
    });
    const st = ctx(REP, 'rep').storage();
    await assertFails(uploadBytes(ref(st, contractPath()), PDF, meta(REP)));
  });

  it('substituir com um attachmentId NOVO funciona (o caminho real de "Substituir PDF")', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), contractPath('deal-comodato', 'att-1')), PDF, meta(REP));
    });
    const st = ctx(REP, 'rep').storage();
    await assertSucceeds(uploadBytes(ref(st, contractPath('deal-comodato', 'att-2')), PDF, meta(REP)));
  });
});

describe('contrato — delete só do master', () => {
  it('rep não apaga o próprio contrato enviado', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), contractPath()), PDF, meta(REP));
    });
    const st = ctx(REP, 'rep').storage();
    await assertFails(deleteObject(ref(st, contractPath())));
  });

  it('master apaga', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), contractPath()), PDF, meta(REP));
    });
    const st = ctx('master-001', 'master').storage();
    await assertSucceeds(deleteObject(ref(st, contractPath())));
  });
});
