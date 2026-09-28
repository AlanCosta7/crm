/**
 * Testes das Security Rules de `users` — Fase 0 do PLANO_DESENHO_CRM.md
 *
 * Antes da Fase 0, `role`/`productIds`/`isActive` no documento do usuário eram
 * decorativos: a permissão real vinha das custom claims, gravadas uma única vez
 * no convite. A CF `onUserProfileWritten` passou a espelhar o documento nas
 * claims — o que torna esses quatro campos permissão de verdade e transforma a
 * regra "todo mundo edita o próprio documento" numa escalação de privilégio.
 *
 * O que este arquivo prova:
 *  1. O usuário continua editando o que é dele (nome, cor, iniciais).
 *  2. Ele NÃO consegue mexer nos campos que definem permissão — nem para se
 *     promover a master, nem para se desbloquear.
 *  3. O master continua administrando todo mundo.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const SDR = 'sdr-001';
const MASTER = 'master-001';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string, productIds: string[] = ['wizmart']) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds });
}

const userDoc = (db: Firestore, uid: string) => doc(db, `tenants/${TID}/users/${uid}`);

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
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(userDoc(c.firestore(), SDR), {
      uid: SDR, name: 'SDR Teste', email: 'sdr@wizmart.com.br',
      role: 'sdr', productIds: ['wizmart'], isActive: true,
      commissionTier: 'junior', color: '#1A6B1A', initials: 'ST',
    });
    await setDoc(userDoc(c.firestore(), MASTER), {
      uid: MASTER, name: 'Master Teste', email: 'master@wizmart.com.br',
      role: 'master', productIds: ['wizmart', 'smart_cafe'], isActive: true,
    });
  });
});

describe('users — edição do próprio perfil', () => {
  it('o usuário edita os campos cosméticos do próprio documento', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(updateDoc(userDoc(db, SDR), {
      name: 'SDR Renomeado', color: '#8DB600', initials: 'SR',
    }));
  });

  it('o usuário lê o próprio documento', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(getDoc(userDoc(db, SDR)));
  });
});

describe('users — escalação de privilégio bloqueada', () => {
  it('SDR não se promove a master alterando o próprio role', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), { role: 'master' }));
  });

  it('SDR não se promove nem a manager', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), { role: 'manager' }));
  });

  it('usuário bloqueado não se desbloqueia', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(userDoc(c.firestore(), SDR), { isActive: false });
    });
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), { isActive: true }));
  });

  it('SDR não se dá acesso a um produto que não é dele', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), {
      productIds: ['wizmart', 'smart_cafe'],
    }));
  });

  it('SDR não muda o próprio nível de comissão', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), { commissionTier: 'senior' }));
  });

  it('campo cosmético junto com role no MESMO update também é negado', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), {
      name: 'Disfarce', role: 'master',
    }));
  });

  it('SDR não edita o documento de outro usuário', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(userDoc(db, MASTER), { name: 'Invadido' }));
  });
});

describe('users — administração pelo master', () => {
  it('master promove um SDR a manager', async () => {
    const db = ctx(MASTER, 'master', ['wizmart', 'smart_cafe']).firestore();
    await assertSucceeds(updateDoc(userDoc(db, SDR), { role: 'manager' }));
  });

  it('master bloqueia o acesso de um SDR', async () => {
    const db = ctx(MASTER, 'master', ['wizmart', 'smart_cafe']).firestore();
    await assertSucceeds(updateDoc(userDoc(db, SDR), { isActive: false }));
  });

  it('manager NÃO administra usuários — só master', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertFails(updateDoc(userDoc(db, SDR), { role: 'rep' }));
  });
});
