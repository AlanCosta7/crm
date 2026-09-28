/**
 * Testes das Security Rules da coleção `notes` e dos anexos no Storage.
 *
 * Cobrem as decisões tomadas com o cliente em 31/08/2026:
 *  1. viewer (e design) LEEM notas e anexos, mas não escrevem
 *  2. autor edita/exclui a sua; master exclui qualquer uma (moderação)
 *
 * Requer os emuladores no ar — rodar via `npm run test:rules`.
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import {
  attachmentStoragePath,
  contentDispositionFor,
  SIZE_LIMITS,
} from '../../src/features/deals/notes/attachments';

const TID = 'wizmart';
const DEAL = 'deal-001';
const NOTE = 'note-001';

let env: RulesTestEnvironment;

/** Contexto autenticado com os custom claims que o projeto emite de verdade. */
function ctx(uid: string, role: string, productIds = ['wizmart', 'smart_cafe']) {
  return env.authenticatedContext(uid, { tenantId: TID, role, productIds });
}

const noteRef = (db: Firestore, id = NOTE) => doc(db, `tenants/${TID}/notes/${id}`);

const notePayload = (authorId: string, over: Record<string, unknown> = {}) => ({
  tenantId: TID,
  entityType: 'deal',
  entityId: DEAL,
  dealId: DEAL,
  productId: 'wizmart',
  authorId,
  body: 'Cliente pediu proposta **revisada**.',
  attachments: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

/** Caminho de anexo no Storage, no layout definido no plano. */
const attPath = (noteId = NOTE, attId = 'att-1', file = 'proposta.pdf') =>
  `tenants/${TID}/notes/${noteId}/${attId}/${file}`;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

const meta = (ownerUid: string) => ({
  contentType: 'application/pdf',
  customMetadata: { ownerUid },
});

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
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // isTenant() consulta users/{uid} desde a Fase 0 — sem perfil, tudo é negado.
  await seedRulesUsers(env, TID);
  // Semeia uma nota do sdr-001 sem passar pelas rules
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(noteRef(c.firestore()), notePayload('sdr-001'));
    await uploadBytes(ref(c.storage(), attPath()), PDF, meta('sdr-001'));
  });
});

describe('notes — criação', () => {
  it('papel operacional cria a própria nota', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertSucceeds(setDoc(noteRef(db, 'nova'), notePayload('sdr-001')));
  });

  it('não permite criar nota assinada por outra pessoa', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(setDoc(noteRef(db, 'forjada'), notePayload('rep-001')));
  });

  it('viewer não cria nota', async () => {
    const db = ctx('viewer-001', 'viewer').firestore();
    await assertFails(setDoc(noteRef(db, 'do-viewer'), notePayload('viewer-001')));
  });

  it('design não cria nota', async () => {
    const db = ctx('design-001', 'design', ['wizmart']).firestore();
    await assertFails(setDoc(noteRef(db, 'do-design'), notePayload('design-001')));
  });

  it('bloqueia nota de produto fora do escopo do usuário', async () => {
    const db = ctx('sdr-002', 'sdr', ['smart_cafe']).firestore();
    await assertFails(setDoc(noteRef(db, 'fora-escopo'), notePayload('sdr-002')));
  });
});

describe('notes — leitura (decisão 1)', () => {
  it('viewer lê notas', async () => {
    await assertSucceeds(getDoc(noteRef(ctx('viewer-001', 'viewer').firestore())));
  });

  it('design lê notas', async () => {
    await assertSucceeds(getDoc(noteRef(ctx('design-001', 'design', ['wizmart']).firestore())));
  });

  it('usuário de outro tenant não lê', async () => {
    const outro = env.authenticatedContext('x-001', { tenantId: 'outro', role: 'master' });
    await assertFails(getDoc(noteRef(outro.firestore())));
  });

  it('anônimo não lê', async () => {
    await assertFails(getDoc(noteRef(env.unauthenticatedContext().firestore())));
  });
});

describe('notes — edição', () => {
  it('autor edita a própria nota', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertSucceeds(updateDoc(noteRef(db), { body: 'texto corrigido', editedAt: serverTimestamp() }));
  });

  it('outro usuário não edita nota alheia', async () => {
    const db = ctx('rep-001', 'rep').firestore();
    await assertFails(updateDoc(noteRef(db), { body: 'invasão' }));
  });

  it('master não edita nota alheia (só modera excluindo)', async () => {
    const db = ctx('master-001', 'master').firestore();
    await assertFails(updateDoc(noteRef(db), { body: 'reescrita pelo master' }));
  });

  it('autor não consegue transferir a autoria', async () => {
    const db = ctx('sdr-001', 'sdr').firestore();
    await assertFails(updateDoc(noteRef(db), { authorId: 'rep-001' }));
  });
});

describe('notes — exclusão (decisão 2)', () => {
  it('autor exclui a própria nota', async () => {
    await assertSucceeds(deleteDoc(noteRef(ctx('sdr-001', 'sdr').firestore())));
  });

  it('master exclui nota de terceiros', async () => {
    await assertSucceeds(deleteDoc(noteRef(ctx('master-001', 'master').firestore())));
  });

  it('manager não exclui nota de terceiros', async () => {
    await assertFails(deleteDoc(noteRef(ctx('manager-001', 'manager').firestore())));
  });

  it('rep não exclui nota de terceiros', async () => {
    await assertFails(deleteDoc(noteRef(ctx('rep-001', 'rep').firestore())));
  });
});

describe('storage — anexos', () => {
  it('viewer baixa anexo (decisão 1)', async () => {
    const st = ctx('viewer-001', 'viewer').storage();
    await assertSucceeds(getBytes(ref(st, attPath())));
  });

  it('usuário de outro tenant não baixa anexo', async () => {
    const outro = env.authenticatedContext('x-001', { tenantId: 'outro', role: 'master' });
    await assertFails(getBytes(ref(outro.storage(), attPath())));
  });

  it('operacional sobe anexo marcando ownerUid', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertSucceeds(uploadBytes(ref(st, attPath(NOTE, 'att-2')), PDF, meta('rep-001')));
  });

  it('recusa upload sem ownerUid no metadata', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(
      uploadBytes(ref(st, attPath(NOTE, 'att-3')), PDF, { contentType: 'application/pdf' })
    );
  });

  it('recusa upload com ownerUid de terceiro', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(uploadBytes(ref(st, attPath(NOTE, 'att-4')), PDF, meta('sdr-001')));
  });

  it('recusa SVG (XSS servido inline pelo bucket)', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(
      uploadBytes(ref(st, attPath(NOTE, 'att-5', 'x.svg')), PDF, {
        contentType: 'image/svg+xml',
        customMetadata: { ownerUid: 'rep-001' },
      })
    );
  });

  it('recusa tipo fora da allowlist', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(
      uploadBytes(ref(st, attPath(NOTE, 'att-6', 'x.exe')), PDF, {
        contentType: 'application/x-msdownload',
        customMetadata: { ownerUid: 'rep-001' },
      })
    );
  });

  it('viewer não sobe anexo', async () => {
    const st = ctx('viewer-001', 'viewer').storage();
    await assertFails(uploadBytes(ref(st, attPath(NOTE, 'att-7')), PDF, meta('viewer-001')));
  });

  it('dono exclui o próprio anexo', async () => {
    const st = ctx('sdr-001', 'sdr').storage();
    await assertSucceeds(deleteObject(ref(st, attPath())));
  });

  it('master exclui anexo de terceiros', async () => {
    const st = ctx('master-001', 'master').storage();
    await assertSucceeds(deleteObject(ref(st, attPath())));
  });

  it('terceiro não exclui anexo alheio', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(deleteObject(ref(st, attPath())));
  });

  it('nada fora de tenants/{tid}/notes é gravável', async () => {
    const st = ctx('master-001', 'master').storage();
    await assertFails(uploadBytes(ref(st, `tenants/${TID}/qualquer/x.pdf`), PDF, meta('master-001')));
  });
});

describe('notas — objeto imutável', () => {
  it('subir para um attachmentId NOVO funciona', async () => {
    const st = ctx('rep-001', 'rep').storage();
    await assertSucceeds(uploadBytes(ref(st, attPath(NOTE, 'att-novo')), PDF, meta('rep-001')));
  });

  it('subir de novo no MESMO caminho (mesmo attachmentId) é negado', async () => {
    // beforeEach já semeou um objeto em attPath() (att-1) via withSecurityRulesDisabled
    const st = ctx('rep-001', 'rep').storage();
    await assertFails(uploadBytes(ref(st, attPath()), PDF, meta('rep-001')));
  });
});

/**
 * Ponte entre o client e as rules: `attachments.ts` monta o caminho e o
 * metadata do upload, `storage.rules` decide se aceita. Estes testes usam o
 * módulo do client de verdade — se alguém mudar o layout do path ou os limites
 * de um lado só, quebra aqui em vez de quebrar em produção.
 */
describe('storage — contrato entre o client e as rules', () => {
  it('o caminho que o client monta é aceito pelas rules', async () => {
    const st = ctx('rep-001', 'rep').storage();
    const path = attachmentStoragePath(TID, NOTE, 'att-cliente', 'Proposta Comercial.pdf');

    await assertSucceeds(
      uploadBytes(ref(st, path), PDF, {
        contentType: 'application/pdf',
        contentDisposition: contentDispositionFor('document', 'Proposta Comercial.pdf'),
        customMetadata: { ownerUid: 'rep-001', noteId: NOTE, originalName: 'Proposta Comercial.pdf' },
      })
    );
  });

  it('nome com travessia de diretório não escapa do prefixo da nota', async () => {
    const st = ctx('rep-001', 'rep').storage();
    const path = attachmentStoragePath(TID, NOTE, 'att-travessia', '../../../roubado.pdf');

    expect(path.startsWith(`tenants/${TID}/notes/${NOTE}/`)).toBe(true);
    await assertSucceeds(uploadBytes(ref(st, path), PDF, meta('rep-001')));
  });

  it('os limites do client são os mesmos das rules', () => {
    expect(SIZE_LIMITS).toEqual({
      image: 15 * 1024 * 1024,
      audio: 25 * 1024 * 1024,
      document: 25 * 1024 * 1024,
      video: 100 * 1024 * 1024,
    });

    const rules = readFileSync('storage.rules', 'utf8');
    expect(rules).toContain('size <=  15 * 1024 * 1024');
    expect(rules).toContain('size <=  25 * 1024 * 1024');
    expect(rules).toContain('size <= 100 * 1024 * 1024');
  });
});
