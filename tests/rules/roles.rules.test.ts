/**
 * Testes das Security Rules de `roles` e da autorização `manage_deal_cards`
 * vinda do perfil (Configurações › Perfis).
 *
 * Antes desta regra a coleção `roles` era negada por padrão: a aba Perfis não
 * persistia nada e `usePermissions` sempre caía nos padrões do código. Agora o
 * master grava, todo mundo lê — e o documento do perfil passa a valer também
 * nas rules de `deals` (`roleGrantsManageDeals`).
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const DEAL = 'deal-001';
const OWNER_SDR = 'sdr-001';        // dono do card do fixture
const OUTSIDER_SDR = 'sdr-002';     // NÃO participa do card

let env: RulesTestEnvironment;

const ctx = (uid: string, role: string) =>
  env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart'] });
const roleDoc = (db: Firestore, id: string) => doc(db, `tenants/${TID}/roles/${id}`);
const dealDoc = (db: Firestore) => doc(db, `tenants/${TID}/deals/${DEAL}`);
const dealsCol = (db: Firestore) => collection(db, `tenants/${TID}/deals`);

async function seedRole(id: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(roleDoc(c.firestore(), id), { id, name: id, ...data }); });
}

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
    await setDoc(dealDoc(c.firestore()), {
      name: 'Mercado Central', company: 'Mercado Central LTDA', value: 5000,
      stage: 'prospeccao', productId: 'wizmart', funnelId: 'wizmart', funnelType: 'main',
      owner: OWNER_SDR, assignedSdrId: OWNER_SDR, participantIds: [OWNER_SDR], responsibleId: OWNER_SDR,
      status: 'open', due: '—', tasks: { e: false, w: false, m: false }, origin: 'outbound', cohortKeys: {},
    });
  });
});

describe('roles — quem lê e quem grava', () => {
  it('master grava e edita perfis', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertSucceeds(setDoc(roleDoc(db, 'supervisor'), { id: 'supervisor', name: 'Supervisor', permissions: ['view_dashboard'], permissionsRev: 1 }));
    await assertSucceeds(updateDoc(roleDoc(db, 'supervisor'), { permissions: ['view_dashboard', 'view_pipeline'] }));
  });

  it('gestor NÃO grava perfis (só o master)', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertFails(setDoc(roleDoc(db, 'supervisor'), { id: 'supervisor', name: 'Supervisor', permissions: [] }));
  });

  it('SDR, BDR e Rep NÃO gravam — e ninguém se auto-promove editando o próprio perfil', async () => {
    await seedRole('sdr', { permissions: ['view_dashboard'], permissionsRev: 1 });
    for (const [uid, role] of [['sdr-001', 'sdr'], ['bdr-001', 'bdr'], ['rep-001', 'rep']]) {
      await assertFails(updateDoc(roleDoc(ctx(uid, role).firestore(), 'sdr'), { permissions: ['manage_deal_cards'] }));
    }
  });

  it('todo usuário do tenant lê os perfis (o menu e os botões dependem disso)', async () => {
    await seedRole('sdr', { permissions: ['view_dashboard'] });
    for (const [uid, role] of [['sdr-001', 'sdr'], ['bdr-001', 'bdr'], ['viewer-001', 'viewer'], ['manager-001', 'manager']]) {
      await assertSucceeds(getDoc(roleDoc(ctx(uid, role).firestore(), 'sdr')));
    }
  });

  it('sem login não lê', async () => {
    await seedRole('sdr', { permissions: [] });
    await assertFails(getDoc(roleDoc(env.unauthenticatedContext().firestore(), 'sdr')));
  });

  it('usuário bloqueado não lê nem grava', async () => {
    await env.clearFirestore();
    await seedRulesUsers(env, TID, { 'master-001': { isActive: false } });
    await assertFails(setDoc(roleDoc(ctx('master-001', 'master').firestore(), 'x'), { id: 'x', name: 'x', permissions: [] }));
  });
});

describe('deals — manage_deal_cards vem do documento do perfil', () => {
  it('BDR sem documento de perfil: liberado (padrão do código)', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(getDoc(dealDoc(db)));
    await assertSucceeds(updateDoc(dealDoc(db), { assignedSdrId: OUTSIDER_SDR }));
  });

  it('BDR com perfil SALVO na versão atual SEM a permissão: bloqueado (o master a tirou)', async () => {
    await seedRole('bdr', { permissions: ['view_dashboard', 'view_pipeline'], permissionsRev: 1 });
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertFails(getDoc(dealDoc(db)));
    await assertFails(updateDoc(dealDoc(db), { stage: 'conectado' }));
    await assertFails(getDocs(dealsCol(db)));                                              // sem filtro: negado por inteiro
    await assertSucceeds(getDocs(query(dealsCol(db), where('participantIds', 'array-contains', 'bdr-001'))));  // com filtro: ok
  });

  it('BDR com perfil COM a permissão: liberado', async () => {
    await seedRole('bdr', { permissions: ['view_dashboard', 'manage_deal_cards'], permissionsRev: 1 });
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(getDoc(dealDoc(db)));
    await assertSucceeds(getDocs(dealsCol(db)));
  });

  it('BDR com perfil salvo ANTES de permissionsRev existir: recebe a permissão pelo rollout', async () => {
    await seedRole('bdr', { permissions: ['view_dashboard'] });
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), { stage: 'conectado' }));
  });

  it('SDR que NÃO participa ganha acesso se o master marcar a permissão no perfil SDR', async () => {
    const db = ctx(OUTSIDER_SDR, 'sdr').firestore();
    await assertFails(getDoc(dealDoc(db)));
    await seedRole('sdr', { permissions: ['view_dashboard', 'manage_deal_cards'], permissionsRev: 1 });
    await assertSucceeds(getDoc(dealDoc(db)));
    await assertSucceeds(updateDoc(dealDoc(db), { assignedSdrId: OUTSIDER_SDR }));
  });

  it('perfil personalizado (ex.: supervisor) com a permissão também vale', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `tenants/${TID}/users/sup-001`), {
        uid: 'sup-001', name: 'sup', email: 's@x.com', role: 'supervisor', productIds: ['wizmart'], isActive: true,
      });
    });
    const db = ctx('sup-001', 'supervisor').firestore();
    await assertFails(getDoc(dealDoc(db)));
    await seedRole('supervisor', { permissions: ['manage_deal_cards'], permissionsRev: 1 });
    await assertSucceeds(updateDoc(dealDoc(db), { stage: 'conectado' }));
  });

  it('viewer e design NUNCA editam, mesmo com a permissão marcada no perfil', async () => {
    await seedRole('viewer', { permissions: ['manage_deal_cards'], permissionsRev: 1 });
    await seedRole('design', { permissions: ['manage_deal_cards'], permissionsRev: 1 });
    await assertFails(updateDoc(dealDoc(ctx('viewer-001', 'viewer').firestore()), { stage: 'conectado' }));
    await assertFails(updateDoc(dealDoc(ctx('design-001', 'design').firestore()), { stage: 'conectado' }));
  });

  it('Gestor e Master seguem com acesso total, com ou sem perfil salvo', async () => {
    await seedRole('manager', { permissions: ['view_dashboard'], permissionsRev: 1 });
    await assertSucceeds(updateDoc(dealDoc(ctx('manager-001', 'manager').firestore()), { stage: 'conectado' }));
    await assertSucceeds(updateDoc(dealDoc(ctx('master-001', 'master').firestore()), { stage: 'fechado' }));
  });

  it('SDR participante continua editando o próprio card sem depender de perfil', async () => {
    await seedRole('sdr', { permissions: [], permissionsRev: 1 });
    await assertSucceeds(updateDoc(dealDoc(ctx(OWNER_SDR, 'sdr').firestore()), { stage: 'conectado' }));
  });
});
