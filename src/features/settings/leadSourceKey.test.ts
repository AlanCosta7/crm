/**
 * leadSourceKey.test.ts — Geração client-side de chave de fonte de captação.
 */

import { describe, expect, it } from 'vitest';
import { generateLeadSourceKey, parseOriginsInput, sha256Hex } from './leadSourceKey';

describe('generateLeadSourceKey', () => {
  it('gera chave no formato wzk_ + 43 chars base64url (igual ao backend)', async () => {
    const { key, hash, prefix } = await generateLeadSourceKey();
    expect(key).toMatch(/^wzk_[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prefix).toBe(`${key.slice(0, 12)}…`);
  });

  it('hash corresponde ao SHA-256 da chave', async () => {
    const { key, hash } = await generateLeadSourceKey();
    expect(await sha256Hex(key)).toBe(hash);
  });

  it('gera chaves únicas', async () => {
    const keys = await Promise.all(Array.from({ length: 20 }, () => generateLeadSourceKey()));
    expect(new Set(keys.map(k => k.key)).size).toBe(20);
  });

  it('sha256Hex bate com vetor conhecido', async () => {
    // echo -n "abc" | shasum -a 256
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('parseOriginsInput', () => {
  it('separa por linha e por vírgula, normalizando e prefixando https:// quando ausente', () => {
    expect(parseOriginsInput('https://Site.com.br/\n lp.site.com.br , https://outro.com')).toEqual([
      'https://site.com.br',
      'https://lp.site.com.br',
      'https://outro.com',
    ]);
  });

  it('remove vazios e duplicatas', () => {
    expect(parseOriginsInput('a.com\n\n a.com \n,,b.com')).toEqual(['https://a.com', 'https://b.com']);
    expect(parseOriginsInput('')).toEqual([]);
    expect(parseOriginsInput('  \n  ')).toEqual([]);
  });

  it('preserva wildcard de subdomínio', () => {
    expect(parseOriginsInput('https://*.wizmart.com.br')).toEqual(['https://*.wizmart.com.br']);
  });

  it('extrai só a origem quando o admin cola a URL completa da página (caso real de uso)', () => {
    expect(parseOriginsInput('https://crm-codifyx.web.app/teste-captacao-leads.html')).toEqual([
      'https://crm-codifyx.web.app',
    ]);
    expect(parseOriginsInput('site.com/landing?utm_source=google&utm_campaign=x')).toEqual([
      'https://site.com',
    ]);
  });

  it('deduplica quando a mesma origem é colada com e sem path', () => {
    expect(parseOriginsInput('https://site.com\nhttps://site.com/outra-pagina')).toEqual([
      'https://site.com',
    ]);
  });
});
