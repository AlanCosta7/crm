/**
 * acesso-bloqueado.rules.test.ts — bloqueio imediato de acesso
 *
 * Decisão do Alan (10/09/2026), em resposta à pergunta do PLANO_DESENHO_CRM.md:
 * vale o custo de um `get()` por operação nas rules para fechar a janela de até
 * 1 hora em que um ID token já emitido continuava sendo aceito.
 *
 * É também a resposta ao "login/logoff do notebook pelo CRM" do slide 12: o que
 * o cliente quer não é controlar a sessão do sistema operacional, e sim que
 * "quando um usuário for inativado ele seja deslogado e não consiga mais ver os
 * dados". Estes testes são a prova disso.
 *
 * O par positivo importa tanto quanto o negativo: bloquear o inativo não pode
 * ter tirado o acesso de quem está ativo.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, collection, addDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
const REP = 'rep-001';
const SDR = 'sdr-001';
const MASTER = 'master-001';
const DEAL = 'deal-001';

let env: RulesTestEnvironment;

function ctx(uid: string, role: string) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart'] });
}

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
  // rep-001 foi dispensado: bloqueado no documento, mas com token ainda válido.
  await seedRulesUsers(env, TID, { [REP]: { isActive: false } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, `tenants/${TID}/deals/${DEAL}`), {
      name: 'Mercado Central', company: 'Mercado Central LTDA', value: 5000,
      stage: 'prospeccao', productId: 'wizmart', funnelId: 'wizmart', funnelType: 'main',
      owner: SDR, assignedSdrId: SDR, assignedRepId: REP,
      participantIds: [SDR, REP], responsibleId: SDR,
      status: 'open', due: '—', tasks: { e: false, w: false, m: false },
      origin: 'outbound', cohortKeys: {},
    });
    await setDoc(doc(db, `tenants/${TID}/contacts/c-001`), {
      name: 'Carlos', productIds: ['wizmart'],
    });
    await setDoc(doc(db, `tenants/${TID}/funnels/wizmart`), {
      name: 'WizMart', type: 'main', productId: 'wizmart', isActive: true, stages: [],
    });
  });
});

// O usuário bloqueado É participante do deal — ou seja, ele seria autorizado por
// todas as outras regras. O que o barra é exclusivamente o `isActive`.
describe('usuário bloqueado perde o acesso na hora', () => {
  it('não lê um deal do qual participa', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/deals/${DEAL}`)));
  });

  it('não edita um deal do qual participa', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(updateDoc(doc(db, `tenants/${TID}/deals/${DEAL}`), { value: 9999 }));
  });

  it('não cria negócio novo', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(addDoc(collection(db, `tenants/${TID}/deals`), {
      name: 'Novo', company: 'X', value: 0, stage: 'prospeccao', productId: 'wizmart',
      owner: REP, status: 'open', due: '—', tasks: { e: false, w: false, m: false },
    }));
  });

  it('não lê contatos', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/contacts/c-001`)));
  });

  it('não lê funis', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/funnels/wizmart`)));
  });

  it('não lê nem o próprio documento de usuário', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/users/${REP}`)));
  });

  it('não se desbloqueia sozinho', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(updateDoc(doc(db, `tenants/${TID}/users/${REP}`), { isActive: true }));
  });

  // Bloqueio não é rebaixamento de papel: nem um master bloqueado entra.
  it('master bloqueado também é negado', async () => {
    await env.clearFirestore();
    await seedRulesUsers(env, TID, { [MASTER]: { isActive: false } });
    const db = ctx(MASTER, 'master').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/users/${MASTER}`)));
  });
});

describe('quem está ativo não é afetado', () => {
  it('SDR ativo lê o deal em que participa', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/deals/${DEAL}`)));
  });

  it('SDR ativo edita o deal', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(updateDoc(doc(db, `tenants/${TID}/deals/${DEAL}`), { value: 7000 }));
  });

  it('master ativo administra usuários', async () => {
    const db = ctx(MASTER, 'master').firestore();
    await assertSucceeds(updateDoc(doc(db, `tenants/${TID}/users/${SDR}`), { role: 'manager' }));
  });

  it('perfil sem o campo isActive é tratado como ativo (perfis legados)', async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (c) => {
      // Perfil SEM a chave `isActive`, simulando documento anterior ao campo.
      // Não passa pelo `seedRulesUsers` de propósito: `setDoc` rejeita
      // `isActive: undefined`, e o que se quer é a AUSÊNCIA da chave.
      await setDoc(doc(c.firestore(), `tenants/${TID}/users/${SDR}`), {
        uid: SDR, name: SDR, role: 'sdr', productIds: ['wizmart'],
      });
    });
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/users/${SDR}`)));
  });
});

describe('sem perfil no tenant, sem acesso', () => {
  it('conta autenticada sem documento de usuário é negada', async () => {
    const db = ctx('fantasma-001', 'master').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/deals/${DEAL}`)));
  });

  it('conta de outro tenant continua negada (o gate não substituiu o de tenant)', async () => {
    const outro = env.authenticatedContext('x-001', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(doc(outro.firestore() as Firestore, `tenants/${TID}/deals/${DEAL}`)));
  });
});

// ── settings/cadence — Fase 2 do PLANO_DESENHO_CRM.md ────────────────────────
//
// A régua e os blocos de horário são a agenda de trabalho do time: o SDR precisa
// LER para montar a fila do dia. O resto de `settings` (token de TV, chaves de
// integração) continua master-only.

describe('settings/cadence — leitura pelo time, escrita pela gestão', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `tenants/${TID}/settings/cadence`), {
        sdr: { newCardsPerDay: 3, steps: [], timeBlocks: [] },
      });
      await setDoc(doc(c.firestore(), `tenants/${TID}/settings/general`), { nome: 'WizMart' });
    });
  });

  it('SDR lê a configuração de cadência', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/settings/cadence`)));
  });

  it('viewer também lê (a régua não é confidencial)', async () => {
    const db = ctx('viewer-001', 'viewer').firestore();
    await assertSucceeds(getDoc(doc(db, `tenants/${TID}/settings/cadence`)));
  });

  it('SDR NÃO escreve a configuração', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(doc(db, `tenants/${TID}/settings/cadence`), { sdr: { newCardsPerDay: 99 } }));
  });

  // Corrige um bug existente: a rota /settings/cadencia é master+manager, mas a
  // regra genérica de settings é isMaster — o gestor tomava permission-denied.
  it('manager escreve a configuração de cadência', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertSucceeds(updateDoc(doc(db, `tenants/${TID}/settings/cadence`), { sdr: { newCardsPerDay: 4 } }));
  });

  it('a abertura NÃO vazou os outros documentos de settings', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/settings/general`)));
  });

  // PLANO_DESENHO_CRM.md Fase 6.1: manager ganhou `view_admin_settings` por
  // padrão (achado de QA manual do teste B4 — ele já podia encerrar sessão de
  // usuário pelas rules/CF, mas a tela de Configurações inteira, incluindo
  // "Minha Empresa"/"Integrações" que leem daqui, ficava invisível sem essa
  // permissão). A regra genérica de `settings/{docId}` acompanhou a mudança.
  it('manager também escreve os outros documentos de settings (Fase 6.1)', async () => {
    const db = ctx('manager-001', 'manager').firestore();
    await assertSucceeds(updateDoc(doc(db, `tenants/${TID}/settings/general`), { nome: 'X' }));
  });

  it('sdr/viewer continuam sem acesso aos outros documentos de settings', async () => {
    const db = ctx(SDR, 'sdr').firestore();
    await assertFails(updateDoc(doc(db, `tenants/${TID}/settings/general`), { nome: 'X' }));
  });

  it('usuário bloqueado não lê nem a cadência', async () => {
    const db = ctx(REP, 'rep').firestore();
    await assertFails(getDoc(doc(db, `tenants/${TID}/settings/cadence`)));
  });
});
