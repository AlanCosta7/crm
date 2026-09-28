/**
 * Testes das Security Rules de `deals` — campos derivados do servidor
 *
 * Fase 1.3 do PLANO_DESENHO_CRM.md. `origin` entrou na mesma proteção que
 * `cohortKeys` já tinha (`notWritingServerDerived`): a origem do lead é base de
 * relatório e de comissão, então a UI não pode reescrevê-la — nem para
 * "corrigir" um card, nem para maquiar de onde ele veio.
 *
 * O par negativo importa tanto quanto o positivo: bloquear `origin` não pode
 * ter travado a edição normal do card, que é o que o time faz todo dia.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const SDR = 'sdr-001';
const DEAL = 'deal-001';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart'] });
}

const dealDoc = (db: Firestore, id = DEAL) => doc(db, `tenants/${TID}/deals/${id}`);

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
  // isTenant() consulta users/{uid} desde a Fase 0 — sem perfil, tudo é negado.
  await seedRulesUsers(env, TID);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(dealDoc(c.firestore()), {
      name: 'Mercado Central', company: 'Mercado Central LTDA', value: 5000,
      stage: 'prospeccao', productId: 'wizmart', funnelId: 'wizmart', funnelType: 'main',
      owner: SDR, assignedSdrId: SDR, participantIds: [SDR], responsibleId: SDR,
      status: 'open', due: '—', tasks: { e: false, w: false, m: false },
      origin: 'outbound',
      cohortKeys: {},
    });
  });
});

describe('deals — campos derivados do servidor', () => {
  it('participante NÃO reescreve origin', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(dealDoc(db), { origin: 'inbound' }));
  });

  it('nem a gestão reescreve origin — o campo é do servidor, não do papel', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertFails(updateDoc(dealDoc(db), { origin: 'inbound' }));
  });

  it('origin junto com um campo legítimo no mesmo update também é negado', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(dealDoc(db), { value: 9000, origin: 'inbound' }));
  });

  it('cohortKeys continua bloqueado (proteção que já existia)', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(dealDoc(db), { cohortKeys: { visitScheduledMonth: '2026-09' } }));
  });
});

describe('deals — edição normal segue funcionando', () => {
  it('participante move o card de estágio', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), { stage: 'conectado' }));
  });

  it('participante edita valor, favorito e porte', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), {
      value: 12000, isFavorite: true, clientSize: 'medium',
    }));
  });

  it('reenviar a MESMA origin não é considerado escrita do campo', async () => {
    // O client às vezes reenvia o objeto inteiro do deal; se `origin` vem com o
    // valor que já está lá, `affectedKeys()` não acusa e o update passa.
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), { origin: 'outbound', value: 7000 }));
  });
});

// Autorização `manage_deal_cards` (21/09/2026): BDR, Gestor e Master enxergam,
// movem e trocam o responsável de QUALQUER card. O DEAL do fixture é do
// SDR-001 — o BDR-001 não assina nada nele, que é justamente o caso novo.
describe('deals — autorização manage_deal_cards (BDR, Gestor, Master)', () => {
  it('BDR que NÃO participa lê o card', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(getDoc(dealDoc(db)));
  });

  it('BDR lista a coleção inteira sem filtro de participante', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(getDocs(collection(db, `tenants/${TID}/deals`)));
  });

  it('BDR que NÃO participa move o card de estágio', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), { stage: 'conectado' }));
  });

  it('BDR troca o SDR responsável', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertSucceeds(updateDoc(dealDoc(db), { assignedSdrId: 'sdr-002' }));
  });

  it('Gestor e Master trocam o responsável', async () => {
    await assertSucceeds(updateDoc(dealDoc(ctx('manager-001', 'manager').firestore()), { assignedSdrId: 'sdr-002' }));
    await assertSucceeds(updateDoc(dealDoc(ctx('master-001', 'master').firestore()), { assignedRepId: 'rep-001' }));
  });

  it('BDR também respeita os campos do servidor (origin segue bloqueado)', async () => {
    const db = ctx('bdr-001', 'bdr').firestore();
    await assertFails(updateDoc(dealDoc(db), { origin: 'inbound' }));
  });

  it('SDR/Rep que NÃO participam continuam sem ler nem mover o card', async () => {
    const sdr = ctx('sdr-002', 'sdr').firestore();
    await assertFails(getDoc(dealDoc(sdr)));
    await assertFails(updateDoc(dealDoc(sdr), { stage: 'conectado' }));
    const rep = ctx('rep-001', 'rep').firestore();
    await assertFails(getDoc(dealDoc(rep)));
    await assertFails(updateDoc(dealDoc(rep), { assignedRepId: 'rep-001' }));
  });

  it('Viewer continua sem editar', async () => {
    const db = ctx('viewer-001', 'viewer').firestore();
    await assertFails(updateDoc(dealDoc(db), { assignedSdrId: 'sdr-002' }));
  });
});
