/**
 * templateRender.test.ts — Testes do Renderizador de Templates de Mensagem
 *
 * Cobre: renderização de placeholders (com/sem espaços, múltiplos),
 * preservação de placeholders sem contexto, e extração de variáveis sem duplicatas.
 */

import { describe, it, expect } from 'vitest';
import { renderTemplate, extractVariables } from './templateRender';
import type { TemplateContext } from './templateRender';

describe('renderTemplate — substituição de placeholders', () => {
  it('deve retornar string vazia se o texto for vazio ou indefinido', () => {
    expect(renderTemplate('', {})).toBe('');
    expect(renderTemplate(null as any, {})).toBe('');
  });

  it('deve substituir placeholders básicos pelo valor correspondente no contexto', () => {
    const text = 'Olá {{contato}}, o valor do seu negócio é R$ {{valor}}.';
    const ctx: TemplateContext = {
      contato: 'Alan Costa',
      valor: '15.000',
    };
    expect(renderTemplate(text, ctx)).toBe('Olá Alan Costa, o valor do seu negócio é R$ 15.000.');
  });

  it('deve funcionar com espaços em branco dentro das chaves', () => {
    const text = 'Olá {{ contato }}, bem-vindo à {{  empresa  }}!';
    const ctx: TemplateContext = {
      contato: 'Alan',
      empresa: 'WizMart',
    };
    expect(renderTemplate(text, ctx)).toBe('Olá Alan, bem-vindo à WizMart!');
  });

  it('deve manter o placeholder original se a chave não existir no contexto', () => {
    const text = 'Olá {{contato}}, seu cupom é {{cupom_desconto}}.';
    const ctx: TemplateContext = {
      contato: 'Alan',
    };
    expect(renderTemplate(text, ctx)).toBe('Olá Alan, seu cupom é {{cupom_desconto}}.');
  });

  it('deve manter o placeholder se o valor no contexto for undefined', () => {
    const text = 'Olá {{contato}}.';
    const ctx: TemplateContext = {
      contato: undefined,
    };
    expect(renderTemplate(text, ctx)).toBe('Olá {{contato}}.');
  });

  it('deve converter valores que não são strings se necessário', () => {
    const text = 'O valor é {{valor}}.';
    const ctx: TemplateContext = {
      valor: 42 as any, // simulando valor numérico
    };
    expect(renderTemplate(text, ctx)).toBe('O valor é 42.');
  });

  it('deve suportar chaves com pontos (dot notation)', () => {
    const text = 'Negócio: {{deal.name}} - Responsável: {{user.name}}';
    const ctx: TemplateContext = {
      'deal.name': 'CRM Enterprise',
      'user.name': 'Carla Rep',
    };
    expect(renderTemplate(text, ctx)).toBe('Negócio: CRM Enterprise - Responsável: Carla Rep');
  });
});

describe('extractVariables — extração de chaves de template', () => {
  it('deve retornar array vazio se não houver placeholders', () => {
    expect(extractVariables('Olá Alan, como vai?')).toEqual([]);
    expect(extractVariables('')).toEqual([]);
  });

  it('deve extrair múltiplas variáveis mantendo o nome limpo', () => {
    const text = 'Olá {{contato}}, vimos que o negócio {{ negocio }} da empresa {{  empresa  }} foi atualizado.';
    const result = extractVariables(text);
    expect(result).toHaveLength(3);
    expect(result).toContain('contato');
    expect(result).toContain('negocio');
    expect(result).toContain('empresa');
  });

  it('deve remover duplicatas da lista de variáveis', () => {
    const text = 'Olá {{contato}}, você é o {{contato}}? Se sim, confirme.';
    const result = extractVariables(text);
    expect(result).toEqual(['contato']);
  });

  it('deve extrair chaves contendo pontos', () => {
    const text = 'Acesse {{deal.url}} ou fale com {{user.first.name}}.';
    const result = extractVariables(text);
    expect(result).toHaveLength(2);
    expect(result).toContain('deal.url');
    expect(result).toContain('user.first.name');
  });
});
