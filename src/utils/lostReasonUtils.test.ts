import { describe, it, expect } from 'vitest';
import { LOST_REASONS, getLostReasonLabel, requeuesToBdr, isValidLostReason } from './lostReasonUtils';

describe('LOST_REASONS', () => {
  it('tem exatamente 12 motivos', () => {
    expect(LOST_REASONS).toHaveLength(12);
  });
  it('todos os ids são únicos', () => {
    const ids = LOST_REASONS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('exatamente 2 motivos devolvem ao BDR', () => {
    expect(LOST_REASONS.filter(r => r.requeueToBdr)).toHaveLength(2);
  });
  it('"Fechou com concorrente" e "Não tem interesse no momento" devolvem ao BDR', () => {
    expect(requeuesToBdr('fechou_concorrente')).toBe(true);
    expect(requeuesToBdr('sem_interesse_momento')).toBe(true);
  });
  it('demais motivos NÃO devolvem ao BDR', () => {
    const others = LOST_REASONS.filter(r => !r.requeueToBdr);
    for (const r of others) expect(requeuesToBdr(r.id)).toBe(false);
  });
});

describe('getLostReasonLabel', () => {
  it('retorna o label correto', () => {
    expect(getLostReasonLabel('valor_alto')).toBe('Achou nosso valor alto');
  });
  it('id desconhecido → travessão', () => {
    expect(getLostReasonLabel('inexistente' as any)).toBe('—');
  });
  it('undefined → travessão', () => {
    expect(getLostReasonLabel(undefined)).toBe('—');
  });
});

describe('requeuesToBdr', () => {
  it('id desconhecido → false', () => {
    expect(requeuesToBdr('inexistente')).toBe(false);
  });
});

describe('isValidLostReason', () => {
  it('aceita ids válidos', () => {
    for (const r of LOST_REASONS) expect(isValidLostReason(r.id)).toBe(true);
  });
  it('rejeita string inválida, undefined e números', () => {
    expect(isValidLostReason('xyz')).toBe(false);
    expect(isValidLostReason(undefined)).toBe(false);
    expect(isValidLostReason(42)).toBe(false);
  });
});
