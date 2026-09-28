import { describe, it, expect } from 'vitest';
import { responsibleField, eligibleResponsibles, buildResponsibleChange } from './dealResponsible';

const base = { productId: 'wizmart' as const };

describe('responsibleField — mesma cadeia da CF (rep > sdr > bdr > dono)', () => {
  it('Rep vence quando existe', () => {
    expect(responsibleField({ owner: 'o', bdrId: 'b', assignedSdrId: 's', assignedRepId: 'r' })).toBe('assignedRepId');
  });
  it('sem Rep, o SDR', () => {
    expect(responsibleField({ owner: 'o', bdrId: 'b', assignedSdrId: 's' })).toBe('assignedSdrId');
  });
  it('lead na fila do BDR (sem SDR) → bdrId', () => {
    expect(responsibleField({ owner: 'b', bdrId: 'b' })).toBe('bdrId');
  });
  it('card sem BDR/SDR/Rep → owner', () => {
    expect(responsibleField({ owner: 'o' })).toBe('owner');
  });
});

describe('buildResponsibleChange — só o campo do responsável muda', () => {
  it('troca de SDR não toca em bdrId/assignedRepId/owner', () => {
    const { field, patch } = buildResponsibleChange({ owner: 'b', bdrId: 'b', assignedSdrId: 'sdr-1' }, 'sdr-2');
    expect(field).toBe('assignedSdrId');
    expect(patch).toEqual({ assignedSdrId: 'sdr-2' });
  });
  it('troca de Rep', () => {
    const { patch } = buildResponsibleChange({ owner: 'b', assignedSdrId: 's', assignedRepId: 'rep-1' }, 'rep-2');
    expect(patch).toEqual({ assignedRepId: 'rep-2' });
  });
});

describe('eligibleResponsibles', () => {
  const users = [
    { id: 'sdr-1', role: 'sdr' as const },
    { id: 'sdr-2', role: 'sdr' as const },
    { id: 'sdr-off', role: 'sdr' as const, isActive: false },
    { id: 'sdr-cafe', role: 'sdr' as const, productIds: ['smart_cafe' as const] },
    { id: 'rep-1', role: 'rep' as const },
    { id: 'mgr-1', role: 'manager' as const },
    { id: 'bdr-2', role: 'bdr' as const },
  ];

  it('card com SDR: só outros SDRs ativos do mesmo produto, sem o atual', () => {
    const ids = eligibleResponsibles({ ...base, owner: 'b', bdrId: 'b', assignedSdrId: 'sdr-1' }, users).map(u => u.id);
    expect(ids).toEqual(['sdr-2']);
  });

  it('card com Rep: reps e gestão (como já é no Pipeline), sem o atual', () => {
    const ids = eligibleResponsibles({ ...base, owner: 'b', assignedSdrId: 'sdr-1', assignedRepId: 'rep-1' }, users).map(u => u.id);
    expect(ids).toEqual(['mgr-1']);
  });

  it('lead na fila do BDR: só BDRs', () => {
    const ids = eligibleResponsibles({ ...base, owner: 'bdr-1', bdrId: 'bdr-1' }, users).map(u => u.id);
    expect(ids).toEqual(['bdr-2']);
  });

  it('usuário com productIds sem o produto do card fica de fora; sem productIds passa', () => {
    const cafe = eligibleResponsibles({ productId: 'smart_cafe', owner: 'b', bdrId: 'b', assignedSdrId: 'sdr-1' }, users).map(u => u.id);
    expect(cafe).toEqual(['sdr-2', 'sdr-cafe']);
  });
});
