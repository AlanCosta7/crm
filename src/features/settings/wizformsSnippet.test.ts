/**
 * wizformsSnippet.test.ts — Testes do snippet público public/wizforms.js.
 *
 * O arquivo é vanilla JS (UMD), servido sem build para os sites do cliente
 * (não passa pelo pipeline TS). Importamos seu código-fonte real como texto
 * (`?raw`, recurso do Vite) e o executamos via `new Function` com
 * `module`/`exports` injetados, forçando o branch CommonJS do UMD — assim
 * testamos o arquivo que de fato vai para produção, sem duplicar a lógica
 * em uma cópia TypeScript.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import wizformsSource from '../../../public/wizforms.js?raw';

function loadWizForms(): any {
  const mod: { exports: any } = { exports: {} };
  // eslint-disable-next-line no-new-func
  const runner = new Function('module', 'exports', wizformsSource);
  runner(mod, mod.exports);
  return mod.exports;
}

const WizMartForms = loadWizForms();

describe('parseUtmParams', () => {
  it('extrai e converte utm_* para camelCase', () => {
    expect(
      WizMartForms.parseUtmParams('?utm_source=google&utm_campaign=lancamento&utm_term=cafe')
    ).toEqual({ utmSource: 'google', utmCampaign: 'lancamento', utmTerm: 'cafe' });
  });

  it('ignora chaves vazias e não-utm', () => {
    expect(WizMartForms.parseUtmParams('?utm_source=&ref=x')).toEqual({});
  });

  it('objeto vazio sem query string', () => {
    expect(WizMartForms.parseUtmParams('')).toEqual({});
    expect(WizMartForms.parseUtmParams(undefined)).toEqual({});
  });
});

describe('mapFieldsToPayload', () => {
  it('separa campos conhecidos dos campos custom', () => {
    const payload = WizMartForms.mapFieldsToPayload({
      name: 'Maria Silva',
      email: 'maria@x.com',
      cidade: 'Campinas',
      interesse: 'Smart Café',
    });
    expect(payload).toEqual({
      name: 'Maria Silva',
      email: 'maria@x.com',
      custom: { cidade: 'Campinas', interesse: 'Smart Café' },
    });
  });

  it('omite custom quando vazio', () => {
    const payload = WizMartForms.mapFieldsToPayload({ name: 'Ana', phone: '11987654321' });
    expect(payload.custom).toBeUndefined();
  });

  it('ignora campos de controle (_hp, _ts) e o token do Turnstile', () => {
    const payload = WizMartForms.mapFieldsToPayload({
      name: 'Ana',
      _hp: 'lixo-de-bot',
      _ts: '123',
      'cf-turnstile-response': 'token-xyz',
    });
    expect(payload).toEqual({ name: 'Ana' });
  });

  it('não inclui campo custom com valor vazio', () => {
    const payload = WizMartForms.mapFieldsToPayload({ name: 'Ana', cidade: '' });
    expect(payload.custom).toBeUndefined();
  });
});

describe('buildLeadPayload (com <form> real)', () => {
  function makeForm(fieldsHtml: string) {
    const form = document.createElement('form');
    form.innerHTML = fieldsHtml;
    document.body.appendChild(form);
    return form;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('monta payload completo com tracking a partir da URL atual', () => {
    const form = makeForm(`
      <input name="name" value="Maria Silva">
      <input name="email" value="maria@x.com">
      <input type="hidden" name="_hp" value="">
    `);

    const payload = WizMartForms.buildLeadPayload(form, {
      renderedAt: 1700000000000,
      location: { href: 'https://lp.com/?utm_source=google', search: '?utm_source=google' },
      referrer: 'https://google.com/',
    });

    expect(payload.name).toBe('Maria Silva');
    expect(payload.email).toBe('maria@x.com');
    expect(payload._hp).toBe('');
    expect(payload._ts).toBe(1700000000000);
    expect(payload.tracking).toEqual({
      utmSource: 'google',
      pageUrl: 'https://lp.com/?utm_source=google',
      referrer: 'https://google.com/',
    });
    expect(payload._turnstile).toBeUndefined();
  });

  it('propaga o honeypot preenchido (indica bot)', () => {
    const form = makeForm(`
      <input name="name" value="Bot">
      <input name="_hp" value="http://spam.com">
    `);
    const payload = WizMartForms.buildLeadPayload(form, { renderedAt: Date.now() });
    expect(payload._hp).toBe('http://spam.com');
  });

  it('inclui o token do Turnstile quando presente no form', () => {
    const form = makeForm(`
      <input name="name" value="Maria">
      <input name="cf-turnstile-response" value="token-abc">
    `);
    const payload = WizMartForms.buildLeadPayload(form, { renderedAt: Date.now() });
    expect(payload._turnstile).toBe('token-abc');
  });
});

describe('injectHoneypot / bindForm (DOM)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.querySelectorAll('script[data-wizmart-turnstile]').forEach(el => el.remove());
  });

  it('injeta o honeypot uma única vez ao inicializar', () => {
    document.body.innerHTML = `
      <form data-wizmart-key="wzk_teste123">
        <input name="name">
        <button type="submit">Enviar</button>
      </form>
    `;
    WizMartForms.init();
    const form = document.querySelector('form') as HTMLFormElement;
    expect(form.querySelectorAll('input[name="_hp"]').length).toBe(1);

    WizMartForms.init(); // segunda chamada não duplica nem religa o form
    expect(form.querySelectorAll('input[name="_hp"]').length).toBe(1);
  });

  it('não afeta forms sem data-wizmart-key', () => {
    document.body.innerHTML = `<form><input name="name"></form>`;
    WizMartForms.init();
    const form = document.querySelector('form') as HTMLFormElement;
    expect(form.querySelector('input[name="_hp"]')).toBeNull();
  });

  it('carrega o script e o widget do Turnstile quando configurado', () => {
    document.body.innerHTML = `
      <form data-wizmart-key="wzk_teste" data-wizmart-turnstile-sitekey="0xSITEKEY">
        <input name="name">
      </form>
    `;
    WizMartForms.init();
    expect(document.querySelector('script[data-wizmart-turnstile]')).not.toBeNull();
    const widget = document.querySelector('.cf-turnstile');
    expect(widget?.getAttribute('data-sitekey')).toBe('0xSITEKEY');

    WizMartForms.init(); // idempotente: não duplica script nem widget
    expect(document.querySelectorAll('script[data-wizmart-turnstile]').length).toBe(1);
    expect(document.querySelectorAll('.cf-turnstile').length).toBe(1);
  });

  it('não injeta Turnstile quando a fonte não exige', () => {
    document.body.innerHTML = `<form data-wizmart-key="wzk_teste"><input name="name"></form>`;
    WizMartForms.init();
    expect(document.querySelector('.cf-turnstile')).toBeNull();
    expect(document.querySelector('script[data-wizmart-turnstile]')).toBeNull();
  });
});

describe('submit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejeita sem key', async () => {
    await expect(WizMartForms.submit({ name: 'Ana' }, {})).rejects.toThrow(/key/i);
  });

  it('faz POST com header X-WizMart-Key e retorna ok/status/body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, leadId: 'abc123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await WizMartForms.submit(
      { name: 'Ana', email: 'ana@x.com' },
      { key: 'wzk_teste', endpoint: 'https://x.com/api/leads' }
    );

    expect(fetchMock).toHaveBeenCalledWith('https://x.com/api/leads', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-WizMart-Key': 'wzk_teste' }),
    }));
    expect(result).toEqual({ ok: true, status: 201, body: { ok: true, leadId: 'abc123' } });
  });

  it('usa o endpoint padrão de produção quando não informado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await WizMartForms.submit({ name: 'Ana' }, { key: 'wzk_teste' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://wizmart-crm.web.app/api/leads',
      expect.anything()
    );
  });
});
