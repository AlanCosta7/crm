/**
 * Rules de `sdr_events` (PLANO_DESENHO_CRM_2, Fase B): base do Ranking da TV.
 * Só a CF `onDealStageChanged` (Admin SDK) escreve; o client nunca — senão um SDR
 * fabricaria as próprias visitas e subiria no pódio.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
let env: RulesTestEnvironment;
const ctx = (uid: string, role: string) => env.authenticatedContext(uid, { tenantId: TID, role });
const path = `tenants/${TID}/sdr_events/d1__visit_scheduled`;

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
    await setDoc(doc(c.firestore(), path), { sdrId: 'sdr-001', dealId: 'd1', kind: 'visit_scheduled', at: serverTimestamp() });
  });
});

describe('sdr_events — leitura', () => {
  it('master lê', async () => { await assertSucceeds(getDoc(doc(ctx('master-001', 'master').firestore(), path))); });
  it('manager lê', async () => { await assertSucceeds(getDoc(doc(ctx('manager-001', 'manager').firestore(), path))); });
  it('sdr NÃO lê (nem o próprio evento)', async () => { await assertFails(getDoc(doc(ctx('sdr-001', 'sdr').firestore(), path))); });
  it('outro tenant nunca lê', async () => {
    const outro = env.authenticatedContext('x', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(doc(outro.firestore(), path)));
  });
});

describe('sdr_events — escrita (sempre negada ao client)', () => {
  const evento = { sdrId: 'sdr-001', dealId: 'd9', kind: 'visit_scheduled', at: serverTimestamp() };
  it('sdr não fabrica as próprias visitas', async () => {
    await assertFails(setDoc(doc(ctx('sdr-001', 'sdr').firestore(), `tenants/${TID}/sdr_events/d9__visit_scheduled`), evento));
  });
  it('nem master escreve — só a Cloud Function', async () => {
    await assertFails(setDoc(doc(ctx('master-001', 'master').firestore(), `tenants/${TID}/sdr_events/d9__visit_scheduled`), evento));
  });
  it('ninguém apaga', async () => {
    await assertFails(deleteDoc(doc(ctx('master-001', 'master').firestore(), path)));
  });
});
