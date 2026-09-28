import { describe, it, expect } from 'vitest';
import { clampQty, hasAnyEquipment, EMPTY_QUANTITIES, EQUIPMENT_FIELDS, PDV_OPTIONS, MAX_QTY } from './projectRequestForm';

describe('clampQty — teto de 10 do Word', () => {
  it('0 a 10 passam como estão', () => {
    expect(clampQty(0)).toBe(0);
    expect(clampQty(7)).toBe(7);
    expect(clampQty(10)).toBe(10);
  });
  it('acima de 10 vira 10; abaixo de 0 vira 0', () => {
    expect(clampQty(11)).toBe(MAX_QTY);
    expect(clampQty(999)).toBe(10);
    expect(clampQty(-3)).toBe(0);
  });
  it('lixo vira 0 e decimal é truncado', () => {
    expect(clampQty(NaN)).toBe(0);
    expect(clampQty(3.9)).toBe(3);
    expect(clampQty(Infinity)).toBe(0);
  });
});

describe('rótulos do cliente (Word)', () => {
  const labels = EQUIPMENT_FIELDS.map((f) => f.label);
  it('usa os nomes pedidos', () => {
    expect(labels).toContain('Luminária WizMart');
    expect(labels).toContain('Letreiro WizMart');
    expect(labels).toContain('Quantidade de Freezer Horizontal — Picolé');
  });
  it('são exatamente os 6 equipamentos do Word', () => {
    expect(EQUIPMENT_FIELDS).toHaveLength(6);
  });
  it('tipo de PDV: Nanomarket, Micromarket, Loja e Container', () => {
    expect(PDV_OPTIONS.map((o) => o.label)).toEqual(['Nanomarket', 'Micromarket', 'Loja', 'Container']);
  });
});

describe('hasAnyEquipment', () => {
  it('tudo zero = nenhum', () => expect(hasAnyEquipment(EMPTY_QUANTITIES)).toBe(false));
  it('um item basta', () => expect(hasAnyEquipment({ ...EMPTY_QUANTITIES, sign: 1 })).toBe(true));
});
