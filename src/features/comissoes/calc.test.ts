/**
 * calc.test.ts — Testes do núcleo de comissão.
 * Casos baseados nos exemplos práticos passados pelo Admin (2026-06-23).
 */

import { describe, it, expect } from 'vitest';
import {
  projetarFaturamento,
  avaliarGatilho,
  calcularComissao,
  parcelarManual,
  parcelarPorTeto,
  dataPagamentoDia15,
  sdrStandardRate,
  CAFE_TOTAL_RATE,
} from './calc';

describe('projetarFaturamento', () => {
  it('projeta (vendido/dias)*30 — exemplo do Minimercado: 1k em 10 dias = 3k', () => {
    expect(projetarFaturamento(1000, 10)).toBe(3000);
  });
  it('retorna 0 com dias inválidos', () => {
    expect(projetarFaturamento(1000, 0)).toBe(0);
    expect(projetarFaturamento(1000, -5)).toBe(0);
  });
  it('retorna 0 com vendido negativo', () => {
    expect(projetarFaturamento(-100, 10)).toBe(0);
  });
});

describe('sdrStandardRate', () => {
  it('aplica o tier; ausente vira junior', () => {
    expect(sdrStandardRate('junior')).toBe(0.075);
    expect(sdrStandardRate('pleno')).toBe(0.0875);
    expect(sdrStandardRate('senior')).toBe(0.1);
    expect(sdrStandardRate(undefined)).toBe(0.075);
  });
});

describe('avaliarGatilho', () => {
  it('Minimercado: projeção 3k atinge o gatilho de 3k', () => {
    expect(avaliarGatilho({ sku: 'wizmart_minimercado', faturamentoReferencia: 3000 }).atingido).toBe(true);
  });
  it('Snacks: 1.999 NÃO atinge o gatilho de 2k', () => {
    const r = avaliarGatilho({ sku: 'smartcafe_snacks', faturamentoReferencia: 1999 });
    expect(r.atingido).toBe(false);
    expect(r.motivo).toMatch(/gatilho/i);
  });
  it('Café: exige tabela cheia mesmo acima do gatilho', () => {
    expect(avaliarGatilho({ sku: 'smartcafe_venda_direta', faturamentoReferencia: 1000, tabelaCheia: false }).atingido).toBe(false);
    expect(avaliarGatilho({ sku: 'smartcafe_venda_direta', faturamentoReferencia: 1000, tabelaCheia: true }).atingido).toBe(true);
  });
  it('Comodato: sem mínimo, mas exige 1ª fatura paga', () => {
    expect(avaliarGatilho({ sku: 'smartcafe_comodato', faturamentoReferencia: 0, primeiraFaturaPaga: false }).atingido).toBe(false);
    expect(avaliarGatilho({ sku: 'smartcafe_comodato', faturamentoReferencia: 0, primeiraFaturaPaga: true }).atingido).toBe(true);
  });
  it('SKU sem regra definida não comissiona', () => {
    expect(avaliarGatilho({ sku: 'smartcafe_locacao', faturamentoReferencia: 99999 }).atingido).toBe(false);
  });
});

describe('calcularComissao — modelo padrão', () => {
  it('Minimercado proporcional: 1k já vendido, SDR junior = R$270 (20+75+175)', () => {
    const s = calcularComissao({ sku: 'wizmart_minimercado', base: 1000, sdrTier: 'junior' });
    expect(s.bdr).toBe(20);
    expect(s.sdr).toBe(75);
    expect(s.rep).toBe(175);
    expect(s.total).toBe(270);
  });
  it('aplica tier senior do SDR', () => {
    const s = calcularComissao({ sku: 'wizmart_minimercado', base: 1000, sdrTier: 'senior' });
    expect(s.sdr).toBe(100);
    expect(s.total).toBe(295); // 20 + 100 + 175
  });
});

describe('calcularComissao — modelo café (72%)', () => {
  it('1k vendido com tabela cheia = R$720 (20 + 210 + 490)', () => {
    const s = calcularComissao({ sku: 'smartcafe_venda_direta', base: 1000 });
    expect(s.bdr).toBe(20);
    expect(s.sdr).toBe(210);
    expect(s.rep).toBe(490);
    expect(s.total).toBe(720);
  });
  it('total bate com CAFE_TOTAL_RATE', () => {
    expect(CAFE_TOTAL_RATE).toBeCloseTo(0.72, 10);
  });
});

describe('parcelarPorTeto — comodato (teto R$5.000)', () => {
  it('exemplo do cliente: 23k → 4x5k + 1x3k', () => {
    expect(parcelarPorTeto(23000)).toEqual([
      { numero: 1, valor: 5000 },
      { numero: 2, valor: 5000 },
      { numero: 3, valor: 5000 },
      { numero: 4, valor: 5000 },
      { numero: 5, valor: 3000 },
    ]);
  });
  it('15k → 3x5k exatas', () => {
    expect(parcelarPorTeto(15000)).toEqual([
      { numero: 1, valor: 5000 },
      { numero: 2, valor: 5000 },
      { numero: 3, valor: 5000 },
    ]);
  });
  it('valor menor que o teto → 1 parcela', () => {
    expect(parcelarPorTeto(4425)).toEqual([{ numero: 1, valor: 4425 }]);
  });
  it('teto customizado', () => {
    expect(parcelarPorTeto(7000, 3000)).toEqual([
      { numero: 1, valor: 3000 },
      { numero: 2, valor: 3000 },
      { numero: 3, valor: 1000 },
    ]);
  });
  it('soma das parcelas = total', () => {
    const p = parcelarPorTeto(23600);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBe(23600);
  });
  it('entradas inválidas → []', () => {
    expect(parcelarPorTeto(0)).toEqual([]);
    expect(parcelarPorTeto(1000, 0)).toEqual([]);
  });
});

describe('parcelarManual — utilitário genérico', () => {
  it('15k em 3 parcelas = 3x 5k', () => {
    expect(parcelarManual(15000, 3)).toEqual([
      { numero: 1, valor: 5000 },
      { numero: 2, valor: 5000 },
      { numero: 3, valor: 5000 },
    ]);
  });
  it('joga a sobra de centavos na última parcela', () => {
    const p = parcelarManual(100, 3); // 33,33 + 33,33 + 33,34
    expect(p[0].valor).toBe(33.33);
    expect(p[2].valor).toBe(33.34);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(100, 10);
  });
  it('entradas inválidas → []', () => {
    expect(parcelarManual(0, 3)).toEqual([]);
    expect(parcelarManual(1000, 0)).toEqual([]);
  });
});

describe('dataPagamentoDia15', () => {
  it('inaugurado em 31/Mai → paga 15/Jun', () => {
    const d = dataPagamentoDia15(new Date(Date.UTC(2026, 4, 31)));
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // junho
    expect(d.getUTCDate()).toBe(15);
  });
  it('vira o ano: dezembro → 15/jan', () => {
    const d = dataPagamentoDia15(new Date(Date.UTC(2026, 11, 20)));
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
  });
});
