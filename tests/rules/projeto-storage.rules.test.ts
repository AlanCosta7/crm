/**
 * Rules de Storage dos anexos de Solicitação de Projeto
 * (PLANO_DESENHO_CRM_2.md, A3/A4).
 *
 *  1. Quem solicita (rep/sdr/bdr/gestão) sobe FOTO e VÍDEO na pasta `request/`;
 *     PDF ali é negado (o Word pede só fotos e vídeos).
 *  2. viewer, design e financeiro NÃO sobem na pasta `request/`.
 *  3. Só o Design (ou gestão) sobe na pasta `delivery/` — rep NÃO entrega o
 *     próprio projeto. PDF, imagem e vídeo; nada além disso.
 *  4. Limites de tamanho por tipo.
 *  5. Objetos imutáveis (`resource == null`) e delete só do master.
 *  6. Leitura por qualquer membro do tenant, nunca de outro tenant.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { seedRulesUsers } from './fixtures';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const TID = 'wizmart';
let env: RulesTestEnvironment;

const ctx = (uid: string, role: string) =>
  env.authenticatedContext(uid, { tenantId: TID, role, productIds: ['wizmart', 'smart_cafe'] });

const reqPath = (att = 'a1', file = 'loja.jpg') => `tenants/${TID}/project_requests/req-1/request/${att}/${file}`;
const delPath = (att = 'a1', file = 'layout.pdf') => `tenants/${TID}/project_requests/req-1/delivery/${att}/${file}`;

const BYTES = new Uint8Array([1, 2, 3, 4]);
const meta = (ownerUid: string, contentType: string) => ({ contentType, customMetadata: { ownerUid } });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-wizmart-crm-local',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8081 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9198 },
  });
}, 90000);
afterAll(async () => { await env?.cleanup(); });
// O emulador de Storage não zera entre testes: cada caso usa um attachmentId
// próprio (a1, a2, a-mgr…) — reusar um deixaria `resource != null` e negaria por engano.
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedRulesUsers(env, TID);
});

describe('solicitação — pasta request/ (fotos e vídeos)', () => {
  it('rep sobe foto', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath()), BYTES, meta('rep-001', 'image/jpeg')));
  });
  it('sdr e bdr sobem vídeo', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('sdr-001', 'sdr').storage(), reqPath('a2', 'v.mp4')), BYTES, meta('sdr-001', 'video/mp4')));
    await assertSucceeds(uploadBytes(ref(ctx('bdr-001', 'bdr').storage(), reqPath('a3', 'v.mp4')), BYTES, meta('bdr-001', 'video/mp4')));
  });
  it('manager sobe foto', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('manager-001', 'manager').storage(), reqPath('a-mgr')), BYTES, meta('manager-001', 'image/png')));
  });
  it('PDF na solicitação é negado — o cliente pediu só fotos e vídeos', async () => {
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath('a1', 'x.pdf')), BYTES, meta('rep-001', 'application/pdf')));
  });
  it('SVG é negado', async () => {
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath('a1', 'x.svg')), BYTES, meta('rep-001', 'image/svg+xml')));
  });
  it('ownerUid de outra pessoa é negado', async () => {
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath()), BYTES, meta('sdr-001', 'image/jpeg')));
  });
  it('viewer, design e financeiro NÃO sobem', async () => {
    for (const [uid, role] of [['viewer-001', 'viewer'], ['design-001', 'design'], ['financeiro-001', 'financeiro']]) {
      await assertFails(uploadBytes(ref(ctx(uid, role).storage(), reqPath(`a-${role}`)), BYTES, meta(uid, 'image/jpeg')));
    }
  });
  it('vídeo acima de 100 MB é negado', async () => {
    const grande = new Uint8Array(101 * 1024 * 1024);
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath('big', 'v.mp4')), grande, meta('rep-001', 'video/mp4')));
  });
  it('imagem acima de 15 MB é negada', async () => {
    const grande = new Uint8Array(16 * 1024 * 1024);
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath('big')), grande, meta('rep-001', 'image/jpeg')));
  });
});

describe('entrega — pasta delivery/ (só o Design)', () => {
  it('design entrega PDF', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath()), BYTES, meta('design-001', 'application/pdf')));
  });
  it('design entrega imagem e vídeo', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath('a2', 'r.png')), BYTES, meta('design-001', 'image/png')));
    await assertSucceeds(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath('a3', 'r.mp4')), BYTES, meta('design-001', 'video/mp4')));
  });
  it('manager também entrega', async () => {
    await assertSucceeds(uploadBytes(ref(ctx('manager-001', 'manager').storage(), delPath('a-mgr')), BYTES, meta('manager-001', 'application/pdf')));
  });
  it('rep NÃO entrega o próprio projeto', async () => {
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), delPath()), BYTES, meta('rep-001', 'application/pdf')));
  });
  it('sdr e bdr NÃO entregam', async () => {
    await assertFails(uploadBytes(ref(ctx('sdr-001', 'sdr').storage(), delPath('a1')), BYTES, meta('sdr-001', 'application/pdf')));
    await assertFails(uploadBytes(ref(ctx('bdr-001', 'bdr').storage(), delPath('a2')), BYTES, meta('bdr-001', 'application/pdf')));
  });
  it('planilha e zip não são entrega', async () => {
    await assertFails(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath('a1', 'x.zip')), BYTES, meta('design-001', 'application/zip')));
    await assertFails(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath('a2', 'x.xlsx')),
      BYTES, meta('design-001', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')));
  });
  it('PDF acima de 25 MB é negado', async () => {
    const grande = new Uint8Array(26 * 1024 * 1024);
    await assertFails(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath('big')), grande, meta('design-001', 'application/pdf')));
  });
});

describe('imutabilidade, delete e leitura', () => {
  it('reenviar no MESMO caminho é negado (resource == null)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), delPath()), BYTES, meta('design-001', 'application/pdf'));
    });
    await assertFails(uploadBytes(ref(ctx('design-001', 'design').storage(), delPath()), BYTES, meta('design-001', 'application/pdf')));
  });
  it('a mesma proteção vale na pasta request/', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), reqPath()), BYTES, meta('rep-001', 'image/jpeg'));
    });
    await assertFails(uploadBytes(ref(ctx('rep-001', 'rep').storage(), reqPath()), BYTES, meta('rep-001', 'image/jpeg')));
  });
  it('rep não apaga; master apaga', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), reqPath()), BYTES, meta('rep-001', 'image/jpeg'));
    });
    await assertFails(deleteObject(ref(ctx('rep-001', 'rep').storage(), reqPath())));
    await assertSucceeds(deleteObject(ref(ctx('master-001', 'master').storage(), reqPath())));
  });
  it('qualquer membro do tenant lê a entrega (o solicitante abre o projeto)', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), delPath()), BYTES, meta('design-001', 'application/pdf'));
    });
    await assertSucceeds(getBytes(ref(ctx('rep-001', 'rep').storage(), delPath())));
  });
  it('outro tenant nunca lê', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), delPath()), BYTES, meta('design-001', 'application/pdf'));
    });
    const outro = env.authenticatedContext('x', { tenantId: 'outro', role: 'master' });
    await assertFails(getBytes(ref(outro.storage(), delPath())));
  });
});
