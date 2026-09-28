import { describe, it, expect } from 'vitest';
import {
  detectKind,
  validateFile,
  sanitizeFileName,
  attachmentStoragePath,
  contentDispositionFor,
  formatBytes,
  fileExtension,
  documentIcon,
  totalSize,
  SIZE_LIMITS,
} from './attachments';
import type { NoteAttachment } from '../../../types/crm';

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('detectKind', () => {
  it('classifica documentos de escritório', () => {
    expect(detectKind('application/pdf')).toBe('document');
    expect(detectKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
    expect(detectKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('document');
    expect(detectKind('text/csv')).toBe('document');
  });

  it('classifica mídia', () => {
    expect(detectKind('image/jpeg')).toBe('image');
    expect(detectKind('image/heic')).toBe('image');
    expect(detectKind('video/quicktime')).toBe('video');
    expect(detectKind('audio/mp4')).toBe('audio');
  });

  it('recusa SVG e HTML — servidos inline viram XSS no domínio do bucket', () => {
    expect(detectKind('image/svg+xml')).toBeNull();
    expect(detectKind('text/html')).toBeNull();
  });

  it('recusa executáveis e tipo vazio', () => {
    expect(detectKind('application/x-msdownload')).toBeNull();
    expect(detectKind('')).toBeNull();
  });

  it('ignora diferença de caixa no MIME', () => {
    expect(detectKind('Application/PDF')).toBe('document');
  });
});

describe('validateFile', () => {
  it('aceita documento dentro do limite', () => {
    expect(validateFile(file('proposta.pdf', 'application/pdf', 2_000_000))).toEqual({
      ok: true,
      kind: 'document',
    });
  });

  it('recusa tipo fora da allowlist com o nome no texto', () => {
    const r = validateFile(file('virus.exe', 'application/x-msdownload'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('virus.exe');
    expect(r.error).toContain('não suportado');
  });

  it('recusa acima do limite e diz qual é o limite', () => {
    const r = validateFile(file('filme.mp4', 'video/mp4', SIZE_LIMITS.video + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('100 MB');
  });

  it('aplica limite diferente por tipo', () => {
    const dezoito = 18 * 1024 * 1024;
    expect(validateFile(file('foto.jpg', 'image/jpeg', dezoito)).ok).toBe(false); // limite 15 MB
    expect(validateFile(file('doc.pdf', 'application/pdf', dezoito)).ok).toBe(true); // limite 25 MB
  });

  it('recusa arquivo vazio', () => {
    const r = validateFile(file('vazio.pdf', 'application/pdf', 0));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('vazio');
  });
});

describe('sanitizeFileName', () => {
  it('preserva nome normal', () => {
    expect(sanitizeFileName('Proposta Comercial v2.pdf')).toBe('Proposta Comercial v2.pdf');
  });

  it('neutraliza travessia de diretório', () => {
    const safe = sanitizeFileName('../../etc/passwd');
    expect(safe).not.toContain('..');
    expect(safe).not.toContain('/');
  });

  it('remove barras invertidas', () => {
    expect(sanitizeFileName('C:\\Users\\alan\\doc.pdf')).not.toContain('\\');
  });

  it('troca caracteres exóticos por underscore', () => {
    expect(sanitizeFileName('relatório #1 (final).pdf')).toBe('relatorio _1 (final).pdf');
  });

  it('nunca devolve string vazia', () => {
    expect(sanitizeFileName('')).toBe('arquivo');
    expect(sanitizeFileName('...')).toBe('arquivo');
  });

  it('corta nome absurdamente longo', () => {
    expect(sanitizeFileName('a'.repeat(400)).length).toBe(120);
  });
});

describe('attachmentStoragePath', () => {
  it('monta o caminho que as rules autorizam', () => {
    expect(attachmentStoragePath('wizmart', 'note1', 'att1', 'proposta.pdf')).toBe(
      'tenants/wizmart/notes/note1/att1/proposta.pdf'
    );
  });

  it('sanitiza o nome dentro do caminho', () => {
    const path = attachmentStoragePath('wizmart', 'note1', 'att1', '../hack.pdf');
    expect(path.split('/')).toHaveLength(6);
    expect(path).not.toContain('..');
  });
});

describe('contentDispositionFor', () => {
  it('força download para documento', () => {
    expect(contentDispositionFor('document', 'contrato.pdf')).toBe('attachment; filename="contrato.pdf"');
  });

  it('deixa mídia ser exibida inline', () => {
    expect(contentDispositionFor('image', 'foto.jpg')).toBeUndefined();
    expect(contentDispositionFor('audio', 'audio.m4a')).toBeUndefined();
    expect(contentDispositionFor('video', 'video.mp4')).toBeUndefined();
  });
});

describe('formatação', () => {
  it('formata tamanhos', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB');
  });

  it('extrai extensão', () => {
    expect(fileExtension('proposta.pdf')).toBe('PDF');
    expect(fileExtension('planilha.xlsx')).toBe('XLSX');
    expect(fileExtension('sem_extensao')).toBe('ARQ');
  });

  it('escolhe ícone por tipo', () => {
    expect(documentIcon('x.pdf', 'application/pdf')).toBe('FileText');
    expect(documentIcon('x.xlsx', '')).toBe('Sheet');
    expect(documentIcon('x.pptx', '')).toBe('Presentation');
    expect(documentIcon('x.zip', '')).toBe('FileArchive');
  });

  it('soma o tamanho dos anexos', () => {
    const list = [{ size: 100 }, { size: 200 }] as NoteAttachment[];
    expect(totalSize(list)).toBe(300);
    expect(totalSize([])).toBe(0);
  });
});
