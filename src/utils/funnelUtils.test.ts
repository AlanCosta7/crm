/**
 * funnelUtils.test.ts — Testes de lógica pura de funis
 *
 * Cobre: convergência, handoff, validação de formulário, SLA,
 * permissões por role e substituição de variáveis em templates.
 */

import { describe, it, expect } from 'vitest';
import {
  funnelById,
  stageInFunnel,
  sortedStages,
  shouldTriggerConvergence,
  shouldRequireHandoff,
  validateHandoffForm,
  isDealOverSla,
  visibleFunnelTypes,
  canMoveDeal,
  applyTemplate,
} from './funnelUtils';
import type { Funnel, FunnelStage, Deal, UserRole } from '../types/crm';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeStage = (overrides: Partial<FunnelStage> & { id: string; order: number }): FunnelStage => ({
  name: overrides.id,
  isConvergencePoint: false,
  isHandoffRequired: false,
  coinsOnEnter: 0,
  slaBusinessDays: 0,
  defaultTemplateIds: [],
  color: '#fff',
  ...overrides,
});

const STAGE_NORMAL    = makeStage({ id: 'qualif',   order: 1 });
const STAGE_CONVERGENCE = makeStage({ id: 'visita', order: 4, isConvergencePoint: true, isHandoffRequired: true });
const STAGE_SLA_3    = makeStage({ id: 'negoc',    order: 3, slaBusinessDays: 3 });

const makeFunnel = (type: Funnel['type'], stages: FunnelStage[] = []): Funnel => ({
  id: `${type}-wm`,
  name: `Funil ${type}`,
  type,
  productId: 'wizmart',
  color: '#1A6B1A',
  isActive: true,
  stages,
});

const INBOUND_FUNNEL  = makeFunnel('inbound',  [STAGE_CONVERGENCE, STAGE_NORMAL]);
const OUTBOUND_FUNNEL = makeFunnel('outbound', [STAGE_NORMAL, STAGE_CONVERGENCE]);
const HUNTER_FUNNEL   = makeFunnel('hunter',   [makeStage({ id: 'h1', order: 1 }), makeStage({ id: 'h2', order: 2 })]);

const makeDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'deal-001', name: 'Deal Teste', company: 'Empresa', value: 10000,
  stage: 'qualif', owner: 'sdr-001', due: '10 jun',
  tasks: { e: false, w: false, m: false },
  status: 'open',
  ...overrides,
});

// ── funnelById ────────────────────────────────────────────────────────────────
describe('funnelById', () => {
  const funnels = [INBOUND_FUNNEL, OUTBOUND_FUNNEL, HUNTER_FUNNEL];

  it('encontra funil existente', () => {
    expect(funnelById(funnels, 'inbound-wm')?.type).toBe('inbound');
  });
  it('retorna undefined para id inexistente', () => {
    expect(funnelById(funnels, 'nao-existe')).toBeUndefined();
  });
});

// ── stageInFunnel ─────────────────────────────────────────────────────────────
describe('stageInFunnel', () => {
  it('encontra estágio existente no funil', () => {
    expect(stageInFunnel(INBOUND_FUNNEL, 'visita')?.isConvergencePoint).toBe(true);
  });
  it('retorna undefined para estágio não pertencente ao funil', () => {
    expect(stageInFunnel(HUNTER_FUNNEL, 'visita')).toBeUndefined();
  });
});

// ── sortedStages ──────────────────────────────────────────────────────────────
describe('sortedStages', () => {
  const funnel = makeFunnel('inbound', [
    makeStage({ id: 'c', order: 3 }),
    makeStage({ id: 'a', order: 1 }),
    makeStage({ id: 'b', order: 2 }),
  ]);

  it('ordena estágios por order crescente', () => {
    const sorted = sortedStages(funnel);
    expect(sorted.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('não muta o array original', () => {
    const original = funnel.stages.map(s => s.id);
    sortedStages(funnel);
    expect(funnel.stages.map(s => s.id)).toEqual(original);
  });
});

// ── shouldTriggerConvergence ──────────────────────────────────────────────────
describe('shouldTriggerConvergence', () => {
  const openDeal = makeDeal({ status: 'open' });

  it('dispara convergência em Inbound + estágio de convergência', () => {
    expect(shouldTriggerConvergence(openDeal, STAGE_CONVERGENCE, 'inbound')).toBe(true);
  });
  it('dispara convergência em Outbound + estágio de convergência', () => {
    expect(shouldTriggerConvergence(openDeal, STAGE_CONVERGENCE, 'outbound')).toBe(true);
  });
  it('NÃO dispara em Hunter (evita loop)', () => {
    expect(shouldTriggerConvergence(openDeal, STAGE_CONVERGENCE, 'hunter')).toBe(false);
  });
  it('NÃO dispara se estágio não é ponto de convergência', () => {
    expect(shouldTriggerConvergence(openDeal, STAGE_NORMAL, 'inbound')).toBe(false);
  });
  it('NÃO dispara se deal já foi convertido', () => {
    const converted = makeDeal({ status: 'converted' });
    expect(shouldTriggerConvergence(converted, STAGE_CONVERGENCE, 'inbound')).toBe(false);
  });
  it('NÃO dispara se deal já foi ganho', () => {
    const won = makeDeal({ status: 'won' });
    expect(shouldTriggerConvergence(won, STAGE_CONVERGENCE, 'inbound')).toBe(false);
  });
});

// ── shouldRequireHandoff ──────────────────────────────────────────────────────
describe('shouldRequireHandoff', () => {
  it('exige handoff se estágio requer e deal não tem handoff', () => {
    expect(shouldRequireHandoff(STAGE_CONVERGENCE, makeDeal())).toBe(true);
  });
  it('NÃO exige se estágio não requer handoff', () => {
    expect(shouldRequireHandoff(STAGE_NORMAL, makeDeal())).toBe(false);
  });
  it('NÃO exige se handoff já foi aceito', () => {
    const d = makeDeal({ handoffStatus: 'accepted' });
    expect(shouldRequireHandoff(STAGE_CONVERGENCE, d)).toBe(false);
  });
  it('NÃO exige se handoff já foi completado', () => {
    const d = makeDeal({ handoffStatus: 'completed' });
    expect(shouldRequireHandoff(STAGE_CONVERGENCE, d)).toBe(false);
  });
  it('EXIGE se handoff está apenas pendente', () => {
    const d = makeDeal({ handoffStatus: 'pending' });
    expect(shouldRequireHandoff(STAGE_CONVERGENCE, d)).toBe(true);
  });
});

// ── validateHandoffForm ───────────────────────────────────────────────────────
describe('validateHandoffForm', () => {
  const futureDate = new Date(Date.now() + 86400000 * 3).toISOString(); // +3 dias

  const validForm = {
    priorityChannel: 'whatsapp' as const,
    visitType: 'presential' as const,
    visitScheduledAt: futureDate,
    toRepId: 'rep-001',
    notes: 'Trazer catálogo',
  };

  it('formulário válido passa sem erros', () => {
    const result = validateHandoffForm(validForm);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('canal prioritário obrigatório', () => {
    const { priorityChannel: _, ...rest } = validForm;
    const result = validateHandoffForm(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.priorityChannel).toBeDefined();
  });

  it('tipo de visita obrigatório', () => {
    const { visitType: _, ...rest } = validForm;
    const result = validateHandoffForm(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.visitType).toBeDefined();
  });

  it('data obrigatória', () => {
    const result = validateHandoffForm({ ...validForm, visitScheduledAt: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.visitScheduledAt).toBeDefined();
  });

  it('data no passado é inválida', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const result = validateHandoffForm({ ...validForm, visitScheduledAt: pastDate });
    expect(result.valid).toBe(false);
    expect(result.errors.visitScheduledAt).toBeDefined();
  });

  it('rep obrigatório', () => {
    const result = validateHandoffForm({ ...validForm, toRepId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.toRepId).toBeDefined();
  });

  it('formula lista todos os erros em uma única chamada', () => {
    const result = validateHandoffForm({});
    expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(4);
  });
});

// ── isDealOverSla ─────────────────────────────────────────────────────────────
describe('isDealOverSla', () => {
  const NOW = Date.now();
  const DAYS_AGO = (n: number) => NOW - n * 24 * 60 * 60 * 1000;

  const makeDealWithDate = (daysAgo: number): Deal => ({
    ...makeDeal(),
    updatedAt: { toDate: () => new Date(DAYS_AGO(daysAgo)) },
  });

  it('retorna false se slaBusinessDays === 0', () => {
    expect(isDealOverSla(makeDealWithDate(10), STAGE_NORMAL, NOW)).toBe(false);
  });

  it('retorna false se ainda dentro do SLA', () => {
    // 3 dias úteis ≈ 4.2 dias corridos — 2 dias não deve ultrapassar
    expect(isDealOverSla(makeDealWithDate(2), STAGE_SLA_3, NOW)).toBe(false);
  });

  it('retorna true se SLA ultrapassado', () => {
    // 10 dias corridos → ~7.1 dias úteis >> SLA de 3
    expect(isDealOverSla(makeDealWithDate(10), STAGE_SLA_3, NOW)).toBe(true);
  });

  it('retorna false se updatedAt ausente', () => {
    expect(isDealOverSla(makeDeal(), STAGE_SLA_3, NOW)).toBe(false);
  });
});

// ── visibleFunnelTypes ────────────────────────────────────────────────────────
describe('visibleFunnelTypes', () => {
  it('master vê todos os 4 funis (main + inbound + outbound + hunter)', () => {
    expect(visibleFunnelTypes('master')).toEqual(['main', 'inbound', 'outbound', 'hunter']);
  });
  it('manager vê todos os 4 funis (main + inbound + outbound + hunter)', () => {
    expect(visibleFunnelTypes('manager')).toEqual(['main', 'inbound', 'outbound', 'hunter']);
  });
  it('bdr vê main + inbound + outbound', () => {
    const types = visibleFunnelTypes('bdr');
    expect(types).toEqual(['main', 'inbound', 'outbound']);
    expect(types).not.toContain('hunter');
  });
  it('sdr vê main + inbound + outbound', () => {
    const types = visibleFunnelTypes('sdr');
    expect(types).toEqual(['main', 'inbound', 'outbound']);
    expect(types).not.toContain('hunter');
  });
  it('rep vê main + hunter', () => {
    const types = visibleFunnelTypes('rep');
    expect(types).toEqual(['main', 'hunter']);
  });
  it('viewer vê todos os 4 funis (main + inbound + outbound + hunter)', () => {
    expect(visibleFunnelTypes('viewer')).toEqual(['main', 'inbound', 'outbound', 'hunter']);
  });
});

// ── canMoveDeal ───────────────────────────────────────────────────────────────
describe('canMoveDeal', () => {
  const canRoles: UserRole[]    = ['master', 'manager', 'bdr', 'sdr', 'rep'];
  const cannotRoles: UserRole[] = ['viewer'];

  canRoles.forEach(r    => it(`${r} pode mover deals`,    () => expect(canMoveDeal(r)).toBe(true)));
  cannotRoles.forEach(r => it(`${r} não pode mover deals`,() => expect(canMoveDeal(r)).toBe(false)));
});

// ── applyTemplate ─────────────────────────────────────────────────────────────
describe('applyTemplate', () => {
  it('substitui variável simples', () => {
    expect(applyTemplate('Olá {{contactFirstName}}!', { contactFirstName: 'João' }))
      .toBe('Olá João!');
  });
  it('substitui múltiplas variáveis', () => {
    const result = applyTemplate('{{contactFirstName}} da {{companyName}}', {
      contactFirstName: 'Ana',
      companyName: 'WizMart',
    });
    expect(result).toBe('Ana da WizMart');
  });
  it('mantém variável sem valor (sem substituição)', () => {
    expect(applyTemplate('Olá {{contactFirstName}}!', {}))
      .toBe('Olá {{contactFirstName}}!');
  });
  it('não altera texto sem variáveis', () => {
    expect(applyTemplate('Texto simples', {})).toBe('Texto simples');
  });
  it('substitui a mesma variável múltiplas vezes', () => {
    const result = applyTemplate('{{userName}} e {{userName}}', { userName: 'Carlos' });
    expect(result).toBe('Carlos e Carlos');
  });
  it('texto vazio retorna vazio', () => {
    expect(applyTemplate('', { contactFirstName: 'X' })).toBe('');
  });
});
