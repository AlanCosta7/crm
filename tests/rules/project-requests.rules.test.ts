/**
 * Rules de `project_requests` (PLANO_DESENHO_CRM_2, A8) — antes sem nenhum teste.
 *
 *  - Quem solicita (bdr/sdr/rep/manager/master) cria SÓ em nome próprio;
 *    viewer, design e financeiro não criam.
 *  - O Design pega um pedido `pending` e só mexe no que está com ele; rep/sdr/bdr
 *    não atualizam; gestão atualiza.
 *  - Leitura por qualquer papel do tenant, nunca de outro tenant. Delete: master.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
let env: RulesTestEnvironment;
const ctx = (uid: string, role: string) => env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart'] });
const P = (id: string) => `tenants/${TID}/project_requests/${id}`;

const pedido = (by: string) => ({
  dealId: 'd1', companyName: 'CSN', requestedBy: by, requestedByName: 'X', requestedByRole: 'rep',
  pdvTypes: ['nanomarket'], quantities: { gondola: 1 }, walls: {}, notes: '', mediaUrls: [],
  status: 'pending', requestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wizmart-crm-local',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8081 },
  });
}, 90000);
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), P('pendente')), { ...pedido('rep-001') });
    await setDoc(doc(c.firestore(), P('do-design')), { ...pedido('rep-001'), status: 'in_progress', assignedToDesignerId: 'design-001' });
    await setDoc(doc(c.firestore(), P('de-outro-design')), { ...pedido('rep-001'), status: 'in_progress', assignedToDesignerId: 'outro-design' });
  });
});

describe('criar solicitação', () => {
  it.each([['rep-001', 'rep'], ['sdr-001', 'sdr'], ['bdr-001', 'bdr'], ['manager-001', 'manager'], ['master-001', 'master']])(
    '%s (%s) cria em nome próprio', async (uid, role) => {
      await assertSucceeds(setDoc(doc(ctx(uid, role).firestore(), P(`novo-${uid}`)), pedido(uid)));
    });
  it('não cria em nome de OUTRA pessoa', async () => {
    await assertFails(setDoc(doc(ctx('rep-001', 'rep').firestore(), P('forjado')), pedido('sdr-001')));
  });
  it('viewer e design não criam', async () => {
    await assertFails(setDoc(doc(ctx('viewer-001', 'viewer').firestore(), P('v')), pedido('viewer-001')));
    await assertFails(setDoc(doc(ctx('design-001', 'design').firestore(), P('d')), pedido('design-001')));
  });
});

describe('Design pega e entrega', () => {
  it('design pega um pedido pendente', async () => {
    await assertSucceeds(updateDoc(doc(ctx('design-001', 'design').firestore(), P('pendente')),
      { status: 'in_progress', assignedToDesignerId: 'design-001', assignedToDesignerName: 'Fernanda' }));
  });
  it('design entrega o que está com ele', async () => {
    await assertSucceeds(updateDoc(doc(ctx('design-001', 'design').firestore(), P('do-design')),
      { status: 'delivered', deliveredFileUrl: 'https://x', deliveredAttachments: [], deliveredByName: 'Fernanda' }));
  });
  it('design NÃO mexe no pedido que está com outro designer', async () => {
    await assertFails(updateDoc(doc(ctx('design-001', 'design').firestore(), P('de-outro-design')), { status: 'delivered' }));
  });
  it('rep, sdr e bdr não atualizam o pedido (nem o próprio) — quem entrega é o Design', async () => {
    for (const [uid, role] of [['rep-001', 'rep'], ['sdr-001', 'sdr'], ['bdr-001', 'bdr']]) {
      await assertFails(updateDoc(doc(ctx(uid, role).firestore(), P('pendente')), { status: 'delivered' }));
    }
  });
  it('manager atualiza', async () => {
    await assertSucceeds(updateDoc(doc(ctx('manager-001', 'manager').firestore(), P('pendente')), { notes: 'ajuste' }));
  });
});

describe('leitura e exclusão', () => {
  it('qualquer papel do tenant lê', async () => {
    for (const [uid, role] of [['rep-001', 'rep'], ['design-001', 'design'], ['viewer-001', 'viewer']]) {
      await assertSucceeds(getDoc(doc(ctx(uid, role).firestore(), P('pendente'))));
    }
  });
  it('outro tenant nunca lê', async () => {
    const outro = env.authenticatedContext('x', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(doc(outro.firestore(), P('pendente'))));
  });
  it('só master exclui', async () => {
    await assertFails(deleteDoc(doc(ctx('manager-001', 'manager').firestore(), P('pendente'))));
    await assertSucceeds(deleteDoc(doc(ctx('master-001', 'master').firestore(), P('pendente'))));
  });
});
