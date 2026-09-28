import { describe, it, expect } from 'vitest';
import { canRequestProject } from './projectAccess';

const deal = { productId: 'wizmart', status: 'open', assignedRepId: 'rep-1', assignedSdrId: 'sdr-1', bdrId: 'bdr-1' } as any;

describe('canRequestProject — botão "Solicitar Projeto" no card', () => {
  it('aparece mesmo SEM mainProduct (o card CSN do cliente não tinha)', () => {
    expect(canRequestProject({ uid: 'rep-1', role: 'rep' }, { ...deal, mainProduct: undefined })).toBe(true);
  });

  it('aparece para qualquer SKU do WizMart, não só minimercado', () => {
    expect(canRequestProject({ uid: 'rep-1', role: 'rep' }, { ...deal, mainProduct: 'wizmart_kit_alimentacao' })).toBe(true);
  });

  it('rep, sdr e bdr do card veem', () => {
    expect(canRequestProject({ uid: 'rep-1', role: 'rep' }, deal)).toBe(true);
    expect(canRequestProject({ uid: 'sdr-1', role: 'sdr' }, deal)).toBe(true);
    expect(canRequestProject({ uid: 'bdr-1', role: 'bdr' }, deal)).toBe(true);
  });

  it('quem não participa do card NÃO vê (mesmo sendo rep)', () => {
    expect(canRequestProject({ uid: 'rep-2', role: 'rep' }, deal)).toBe(false);
  });

  it('participante por participantIds também vê', () => {
    expect(canRequestProject({ uid: 'x', role: 'sdr' }, { ...deal, participantIds: ['x'] })).toBe(true);
  });

  it('manager e master veem em qualquer card', () => {
    expect(canRequestProject({ uid: 'm', role: 'manager' }, deal)).toBe(true);
    expect(canRequestProject({ uid: 'a', role: 'master' }, deal)).toBe(true);
  });

  it('viewer, design e financeiro NÃO veem (as rules negariam o envio)', () => {
    for (const role of ['viewer', 'design', 'financeiro']) {
      expect(canRequestProject({ uid: 'rep-1', role }, deal)).toBe(false);
    }
  });

  it('card de Smart Café não mostra o botão', () => {
    expect(canRequestProject({ uid: 'rep-1', role: 'rep' }, { ...deal, productId: 'smart_cafe' })).toBe(false);
  });

  it('produto ausente conta como WizMart (padrão do sistema)', () => {
    expect(canRequestProject({ uid: 'rep-1', role: 'rep' }, { ...deal, productId: undefined })).toBe(true);
  });

  it('card perdido não pede projeto', () => {
    expect(canRequestProject({ uid: 'm', role: 'manager' }, { ...deal, status: 'lost' })).toBe(false);
  });

  it('sem usuário ou sem papel, nada', () => {
    expect(canRequestProject(null, deal)).toBe(false);
    expect(canRequestProject({ uid: 'rep-1' }, deal)).toBe(false);
  });
});
