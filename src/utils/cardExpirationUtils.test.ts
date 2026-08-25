import { describe, it, expect } from 'vitest';
import {
  getLastActivityAt,
  isCardExpired,
  daysSinceLastActivity,
  CARD_EXPIRATION_DAYS,
} from './cardExpirationUtils';

const NOW = new Date('2026-07-15T12:00:00-03:00').getTime();

describe('getLastActivityAt', () => {
  it('retorna null sem atividades concluídas', () => {
    expect(getLastActivityAt([], 'd1')).toBeNull();
    expect(getLastActivityAt([{ dealId: 'd1', status: 'pending', createdAt: new Date() }], 'd1')).toBeNull();
  });
  it('ignora atividades de outros deals', () => {
    const acts = [{ dealId: 'd2', status: 'completed', completedAt: new Date('2026-07-01') }];
    expect(getLastActivityAt(acts, 'd1')).toBeNull();
  });
  it('retorna a mais recente entre várias concluídas', () => {
    const acts = [
      { dealId: 'd1', status: 'completed', completedAt: new Date('2026-07-01') },
      { dealId: 'd1', status: 'completed', completedAt: new Date('2026-07-10') },
      { dealId: 'd1', status: 'completed', completedAt: new Date('2026-06-20') },
    ];
    expect(getLastActivityAt(acts, 'd1')?.toISOString().slice(0, 10)).toBe('2026-07-10');
  });
  it('usa createdAt quando completedAt ausente', () => {
    const acts = [{ dealId: 'd1', status: 'completed', createdAt: new Date('2026-07-05') }];
    expect(getLastActivityAt(acts, 'd1')?.toISOString().slice(0, 10)).toBe('2026-07-05');
  });
  it('aceita Timestamp do Firestore (toDate)', () => {
    const ts = { toDate: () => new Date('2026-07-08') };
    const acts = [{ dealId: 'd1', status: 'completed', completedAt: ts }];
    expect(getLastActivityAt(acts, 'd1')?.toISOString().slice(0, 10)).toBe('2026-07-08');
  });
});

describe('isCardExpired', () => {
  const base = { status: 'open', assignedSdrId: 'sdr-1' };

  it('não vence sem SDR atribuído', () => {
    expect(isCardExpired({ status: 'open' }, null, NOW)).toBe(false);
  });
  it('não vence se não estiver open (won/lost/converted)', () => {
    expect(isCardExpired({ ...base, status: 'won' }, null, NOW)).toBe(false);
    expect(isCardExpired({ ...base, status: 'lost' }, null, NOW)).toBe(false);
  });
  it('não vence se já passou para o Rep (assignedRepId ou handoffStatus)', () => {
    expect(isCardExpired({ ...base, assignedRepId: 'rep-1' }, null, NOW)).toBe(false);
    expect(isCardExpired({ ...base, handoffStatus: 'pending' }, null, NOW)).toBe(false);
  });
  it('sem atividade e sem assignedAt/createdAt → não vence (sem âncora)', () => {
    expect(isCardExpired(base, null, NOW)).toBe(false);
  });
  it('vence após 21 dias sem atividade (âncora = assignedAt)', () => {
    const deal = { ...base, assignedAt: new Date(NOW - 22 * 86_400_000) };
    expect(isCardExpired(deal, null, NOW)).toBe(true);
  });
  it('NÃO vence com 20 dias (ainda dentro do prazo)', () => {
    const deal = { ...base, assignedAt: new Date(NOW - 20 * 86_400_000) };
    expect(isCardExpired(deal, null, NOW)).toBe(false);
  });
  it('vence exatamente aos 21 dias (limite inclusive)', () => {
    const deal = { ...base, assignedAt: new Date(NOW - CARD_EXPIRATION_DAYS * 86_400_000) };
    expect(isCardExpired(deal, null, NOW)).toBe(true);
  });
  it('última atividade recente reseta o contador mesmo com assignedAt antigo', () => {
    const deal = { ...base, assignedAt: new Date(NOW - 90 * 86_400_000) };
    const lastActivity = new Date(NOW - 2 * 86_400_000);
    expect(isCardExpired(deal, lastActivity, NOW)).toBe(false);
  });
  it('usa createdAt quando assignedAt ausente', () => {
    const deal = { ...base, createdAt: new Date(NOW - 25 * 86_400_000) };
    expect(isCardExpired(deal, null, NOW)).toBe(true);
  });
});

describe('daysSinceLastActivity', () => {
  it('null sem nenhuma âncora', () => {
    expect(daysSinceLastActivity({}, null, NOW)).toBeNull();
  });
  it('calcula a partir da última atividade', () => {
    const lastActivity = new Date(NOW - 5 * 86_400_000);
    expect(daysSinceLastActivity({}, lastActivity, NOW)).toBe(5);
  });
  it('calcula a partir de assignedAt quando não há atividade', () => {
    const deal = { assignedAt: new Date(NOW - 9 * 86_400_000) };
    expect(daysSinceLastActivity(deal, null, NOW)).toBe(9);
  });
});
