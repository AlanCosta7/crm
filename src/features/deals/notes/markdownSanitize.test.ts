import { describe, it, expect } from 'vitest';
import { safeHref, noteSanitizeSchema } from './markdownSanitize';

describe('safeHref', () => {
  it('aceita http, https, mailto e tel', () => {
    expect(safeHref('https://wizmart.com.br')).toBe('https://wizmart.com.br');
    expect(safeHref('http://x.com')).toBe('http://x.com');
    expect(safeHref('mailto:cliente@x.com')).toBe('mailto:cliente@x.com');
    expect(safeHref('tel:+5521999999999')).toBe('tel:+5521999999999');
  });

  it('recusa javascript:', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('  JavaScript:alert(1)')).toBeUndefined();
  });

  it('recusa data: e outros protocolos', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeHref('file:///etc/passwd')).toBeUndefined();
  });

  it('aceita link relativo e âncora', () => {
    expect(safeHref('/lead/deal-001')).toBe('/lead/deal-001');
    expect(safeHref('#secao')).toBe('#secao');
  });

  it('trata href vazio ou ausente', () => {
    expect(safeHref('')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('noteSanitizeSchema', () => {
  it('não permite script, iframe nem style', () => {
    for (const tag of ['script', 'iframe', 'style', 'object', 'embed', 'form']) {
      expect(noteSanitizeSchema.tagNames).not.toContain(tag);
    }
  });

  it('não permite img — imagem entra como anexo, não por URL externa', () => {
    expect(noteSanitizeSchema.tagNames).not.toContain('img');
  });

  it('permite a marcação que a toolbar gera', () => {
    for (const tag of ['strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'table']) {
      expect(noteSanitizeSchema.tagNames).toContain(tag);
    }
  });

  it('restringe href aos protocolos seguros, mais o `wm:` das menções', () => {
    expect(noteSanitizeSchema.protocols?.href).toEqual(['http', 'https', 'mailto', 'tel', 'wm']);
  });

  it('não deixa atributo genérico passar em qualquer tag', () => {
    expect(noteSanitizeSchema.attributes?.['*']).toEqual([]);
  });
});
