import { describe, it, expect } from 'vitest';
import { splitDealActivities } from './dealActivities';
import type { Activity } from '../../types/crm';

function act(overrides: Partial<Activity>): Activity {
  return {
    id: 'a',
    dealId: 'deal-1',
    userId: 'sdr-1',
    type: 'email',
    status: 'completed',
    ...overrides,
  } as Activity;
}

describe('splitDealActivities', () => {
  it('separa pending/overdue em upcoming e o resto em history', () => {
    const activities = [
      act({ id: 'p1', status: 'pending' }),
      act({ id: 'o1', status: 'overdue' }),
      act({ id: 'c1', status: 'completed' }),
      act({ id: 's1', status: 'skipped' }),
      act({ id: 'r1', status: 'rescheduled' }),
    ];
    const { upcoming, history } = splitDealActivities(activities, 'deal-1');
    expect(upcoming.map((a) => a.id)).toEqual(expect.arrayContaining(['p1', 'o1']));
    expect(upcoming).toHaveLength(2);
    expect(history.map((a) => a.id)).toEqual(expect.arrayContaining(['c1', 's1', 'r1']));
    expect(history).toHaveLength(3);
  });

  it('upcoming vem ordenado da mais próxima para a mais distante', () => {
    const activities = [
      act({ id: 'daqui-a-3-dias', status: 'pending', scheduledAt: new Date('2026-09-15T10:00:00Z') }),
      act({ id: 'amanha', status: 'pending', scheduledAt: new Date('2026-09-13T10:00:00Z') }),
      act({ id: 'hoje', status: 'overdue', dueAt: new Date('2026-09-12T23:59:00Z') }),
    ];
    const { upcoming } = splitDealActivities(activities, 'deal-1');
    expect(upcoming.map((a) => a.id)).toEqual(['hoje', 'amanha', 'daqui-a-3-dias']);
  });

  it('history vem ordenado do mais recente para o mais antigo', () => {
    const activities = [
      act({ id: 'antiga', status: 'completed', completedAt: new Date('2026-08-01T10:00:00Z') }),
      act({ id: 'recente', status: 'completed', completedAt: new Date('2026-09-10T10:00:00Z') }),
    ];
    const { history } = splitDealActivities(activities, 'deal-1');
    expect(history.map((a) => a.id)).toEqual(['recente', 'antiga']);
  });

  it('usa dueAt quando scheduledAt não existe (item overdue sem hora de bloco)', () => {
    const activities = [
      act({ id: 'sem-scheduled', status: 'overdue', dueAt: new Date('2026-09-11T23:59:00Z') }),
      act({ id: 'com-scheduled', status: 'pending', scheduledAt: new Date('2026-09-12T10:00:00Z') }),
    ];
    const { upcoming } = splitDealActivities(activities, 'deal-1');
    expect(upcoming.map((a) => a.id)).toEqual(['sem-scheduled', 'com-scheduled']);
  });

  it('ignora atividades de OUTROS deals', () => {
    const activities = [
      act({ id: 'meu', dealId: 'deal-1', status: 'pending' }),
      act({ id: 'de-outro', dealId: 'deal-2', status: 'pending' }),
    ];
    const { upcoming } = splitDealActivities(activities, 'deal-1');
    expect(upcoming.map((a) => a.id)).toEqual(['meu']);
  });

  it('lista vazia devolve upcoming e history vazios', () => {
    expect(splitDealActivities([], 'deal-1')).toEqual({ upcoming: [], history: [] });
  });

  it('suporta Timestamp do Firestore (.toDate()) além de Date nativo', () => {
    const activities = [
      act({ id: 'ts', status: 'pending', scheduledAt: { toDate: () => new Date('2026-09-20T10:00:00Z') } }),
      act({ id: 'date', status: 'pending', scheduledAt: new Date('2026-09-13T10:00:00Z') }),
    ];
    const { upcoming } = splitDealActivities(activities, 'deal-1');
    expect(upcoming.map((a) => a.id)).toEqual(['date', 'ts']);
  });
});
