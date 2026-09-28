import { describe, it, expect } from 'vitest';
import { validateProjectFile, projectAttachmentPath, MAX_REQUEST_FILES } from './projectAttachments';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });
const MB = 1024 * 1024;

describe('validateProjectFile — solicitação (fotos e vídeos)', () => {
  it('aceita foto e vídeo', () => {
    expect(validateProjectFile('request', f('loja.jpg', 'image/jpeg')).ok).toBe(true);
    expect(validateProjectFile('request', f('loja.mp4', 'video/mp4')).ok).toBe(true);
    expect(validateProjectFile('request', f('foto.heic', 'image/heic')).ok).toBe(true);
  });

  it('recusa PDF, planilha e áudio — o Word pede só fotos e vídeos', () => {
    expect(validateProjectFile('request', f('a.pdf', 'application/pdf')).ok).toBe(false);
    expect(validateProjectFile('request', f('a.xlsx', 'application/vnd.ms-excel')).ok).toBe(false);
    expect(validateProjectFile('request', f('a.mp3', 'audio/mpeg')).ok).toBe(false);
  });

  it('recusa SVG (vira XSS no domínio do bucket)', () => {
    expect(validateProjectFile('request', f('x.svg', 'image/svg+xml')).ok).toBe(false);
  });

  it('respeita o limite por tipo: 15 MB de imagem, 100 MB de vídeo', () => {
    expect(validateProjectFile('request', f('a.jpg', 'image/jpeg', 16 * MB)).ok).toBe(false);
    expect(validateProjectFile('request', f('a.jpg', 'image/jpeg', 15 * MB)).ok).toBe(true);
    expect(validateProjectFile('request', f('a.mp4', 'video/mp4', 100 * MB)).ok).toBe(true);
    expect(validateProjectFile('request', f('a.mp4', 'video/mp4', 101 * MB)).ok).toBe(false);
  });

  it('arquivo vazio é recusado', () => {
    expect(validateProjectFile('request', f('a.jpg', 'image/jpeg', 0)).ok).toBe(false);
  });
});

describe('validateProjectFile — entrega do Design', () => {
  it('aceita PDF, imagem e vídeo', () => {
    expect(validateProjectFile('delivery', f('layout.pdf', 'application/pdf')).ok).toBe(true);
    expect(validateProjectFile('delivery', f('render.png', 'image/png')).ok).toBe(true);
    expect(validateProjectFile('delivery', f('tour.mp4', 'video/mp4')).ok).toBe(true);
  });

  it('em documento, só PDF — Word/Excel/zip não são entrega de layout', () => {
    expect(validateProjectFile('delivery', f('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).ok).toBe(false);
    expect(validateProjectFile('delivery', f('a.zip', 'application/zip')).ok).toBe(false);
  });

  it('PDF respeita 25 MB', () => {
    expect(validateProjectFile('delivery', f('a.pdf', 'application/pdf', 26 * MB)).ok).toBe(false);
  });
});

describe('projectAttachmentPath', () => {
  it('separa solicitação de entrega no caminho', () => {
    expect(projectAttachmentPath('t1', 'r1', 'request', 'a1', 'foto.jpg')).toBe('tenants/t1/project_requests/r1/request/a1/foto.jpg');
    expect(projectAttachmentPath('t1', 'r1', 'delivery', 'a2', 'layout.pdf')).toBe('tenants/t1/project_requests/r1/delivery/a2/layout.pdf');
  });

  it('neutraliza nome de arquivo malicioso', () => {
    const p = projectAttachmentPath('t1', 'r1', 'request', 'a1', '../../../etc/passwd');
    expect(p).not.toContain('..');
    expect(p.startsWith('tenants/t1/project_requests/r1/request/a1/')).toBe(true);
  });
});

it('teto de arquivos por solicitação', () => { expect(MAX_REQUEST_FILES).toBe(10); });
