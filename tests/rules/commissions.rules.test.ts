/**
 * Testes das Security Rules de `commissions` — Fase 5.1 do PLANO_DESENHO_CRM.md
 *
 * As rules já permitiam ao beneficiário ler o PRÓPRIO registro
 * (`request.auth.uid in resource.data.beneficiaryIds`) — o que faltava era rota
 * e UI (`MinhaComissaoPage.tsx`). Este arquivo prova o ponto que a página
 * depende para funcionar sem dar acesso amplo à coleção:
 *
 *   Firestore recusa uma QUERY inteira se ela puder devolver um documento que a
 *   regra não libera — não filtra documento a documento. Uma leitura ampla de
 *   `commissions` (sem `where`) precisa ser negada para quem não é
 *   manager/master, e uma leitura COM `where('beneficiaryIds', 'array-contains',
 *   uid)` precisa ser aceita — é exatamente essa combinação que
 *   `MinhaComissaoPage` usa.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';

const TID = 'wizmart';
const SDR = 'sdr-001';
const SDR_2 = 'sdr-002';
const REP = 'rep-001';
const MASTER = 'master-001';
const MANAGER = 'manager-001';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart'] });
}

const commissionDoc = (db: Firestore, id: string) => doc(db, `tenants/${TID}/commissions/${id}`);
const commissionsCol = (db: Firestore) => collection(db, `tenants/${TID}/commissions`);

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
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    // Comissão do SDR — ele é beneficiário.
    await setDoc(commissionDoc(db, 'c-sdr'), {
      dealId: 'd1', dealName: 'Mercado Central', sku: 'wizmart_minimercado',
      faturamentoInformado: 3000, baseCalculo: 3000, proporcional: false,
      split: { bdr: 60, sdr: 262.5, rep: 525, total: 847.5 },
      shares: [
        { role: 'sdr', userId: SDR, userName: 'SDR Teste', valor: 262.5 },
        { role: 'rep', userId: REP, userName: 'Rep Teste', valor: 525 },
      ],
      beneficiaryIds: [SDR, REP],
      status: 'confirmada',
    });
    // Comissão de OUTRO SDR — sdr-001 não é beneficiário aqui.
    await setDoc(commissionDoc(db, 'c-outro'), {
      dealId: 'd2', dealName: 'Atacado Vale Verde', sku: 'wizmart_minimercado',
      faturamentoInformado: 4000, baseCalculo: 4000, proporcional: false,
      split: { bdr: 80, sdr: 350, rep: 700, total: 1130 },
      shares: [{ role: 'sdr', userId: SDR_2, userName: 'Outro SDR', valor: 350 }],
      beneficiaryIds: [SDR_2],
      status: 'paga',
    });
  });
});

describe('commissions — leitura do próprio registro', () => {
  it('beneficiário lê o próprio registro (get direto)', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(getDoc(commissionDoc(db, 'c-sdr')));
  });

  it('beneficiário NÃO lê o registro de outro colega (get direto)', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(getDoc(commissionDoc(db, 'c-outro')));
  });

  // Este é o caso que `MinhaComissaoPage` depende: a query PRECISA ter o
  // `where` para o Firestore aceitar — sem ele, o SDK recusa a leitura ampla
  // inteira, mesmo que o SDR tecnicamente só pudesse "ver" um documento.
  it('query SEM where (leitura ampla) é negada para quem não é gestão', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(getDocs(commissionsCol(db)));
  });

  it('query COM where(beneficiaryIds array-contains uid) é aceita e traz só o meu card', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    const snap = await assertSucceeds(
      getDocs(query(commissionsCol(db), where('beneficiaryIds', 'array-contains', SDR))),
    );
    expect(snap.docs.map(d => d.id)).toEqual(['c-sdr']);
  });

  it('o mesmo where para outro uid traz só o card dele, não o do primeiro', async () => {
    const db = ctx(SDR_2, 'sdr').firestore();
    const snap = await assertSucceeds(
      getDocs(query(commissionsCol(db), where('beneficiaryIds', 'array-contains', SDR_2))),
    );
    expect(snap.docs.map(d => d.id)).toEqual(['c-outro']);
  });

  it('representante lê a própria fatia pelo mesmo caminho', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertSucceeds(getDoc(commissionDoc(db, 'c-sdr')));
  });

  it('gestão continua lendo tudo, sem where', async () => {
    const dbManager = ctx(MANAGER, 'manager').firestore();
    const snap = await assertSucceeds(getDocs(commissionsCol(dbManager)));
    expect(snap.docs.length).toBe(2);
  });
});

describe('commissions — escrita continua restrita à gestão', () => {
  it('beneficiário NÃO cria comissão', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(setDoc(commissionDoc(db, 'c-forjada'), {
      dealId: 'x', dealName: 'Forjado', sku: 'wizmart_minimercado',
      faturamentoInformado: 0, baseCalculo: 0, proporcional: false,
      split: { bdr: 0, sdr: 999999, rep: 0, total: 999999 },
      shares: [{ role: 'sdr', userId: SDR, userName: 'SDR Teste', valor: 999999 }],
      beneficiaryIds: [SDR], status: 'paga',
    }));
  });

  it('beneficiário NÃO edita o próprio valor de comissão', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(setDoc(commissionDoc(db, 'c-sdr'), { status: 'paga' }, { merge: true }));
  });

  it('master exclui, manager não', async () => {
    const dbManager = ctx(MANAGER, 'manager').firestore();
    const dbMaster = ctx(MASTER, 'master').firestore();
    await assertFails(deleteDoc(commissionDoc(dbManager, 'c-sdr')));
    await assertSucceeds(deleteDoc(commissionDoc(dbMaster, 'c-sdr')));
  });
});

describe('commissions — usuário bloqueado (Fase 0) não vê nem a própria fatia', () => {
  it('bloqueado é negado mesmo sendo beneficiário', async () => {
    await env.clearFirestore();
    await seedRulesUsers(env, TID, { [SDR]: { isActive: false } });
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(commissionDoc(c.firestore(), 'c-sdr'), {
        dealId: 'd1', dealName: 'Mercado Central', sku: 'wizmart_minimercado',
        faturamentoInformado: 3000, baseCalculo: 3000, proporcional: false,
        split: { bdr: 0, sdr: 262.5, rep: 0, total: 262.5 },
        shares: [{ role: 'sdr', userId: SDR, userName: 'SDR Teste', valor: 262.5 }],
        beneficiaryIds: [SDR], status: 'confirmada',
      });
    });
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(getDoc(commissionDoc(db, 'c-sdr')));
  });
});
