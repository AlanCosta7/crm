import { describe, it, expect } from 'vitest';
import { projectTimelineSteps } from './dealTimeline';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('projectTimelineSteps', () => {
  it('só eventos de projeto entram (bastão já aparece nos passos derivados do deal)', () => {
    const steps = projectTimelineSteps([
      { type: 'bdr_to_sdr_assigned', message: 'x', createdAt: ts('2026-09-01T10:00:00Z') },
      { type: 'project_requested', message: 'Projeto solicitado', createdAt: ts('2026-09-02T10:00:00Z') },
      { type: 'requeued_to_bdr', message: 'y', createdAt: ts('2026-09-03T10:00:00Z') },
    ]);
    expect(steps.map((s) => s.text)).toEqual(['Projeto solicitado']);
  });

  it('ordena do mais antigo para o mais novo: solicitado → em andamento → entregue', () => {
    const steps = projectTimelineSteps([
      { type: 'project_delivered', message: 'entregue', createdAt: ts('2026-09-05T10:00:00Z') },
      { type: 'project_requested', message: 'pedido', createdAt: ts('2026-09-01T10:00:00Z') },
      { type: 'project_in_progress', message: 'andamento', createdAt: ts('2026-09-03T10:00:00Z') },
    ]);
    expect(steps.map((s) => s.text)).toEqual(['pedido', 'andamento', 'entregue']);
  });

  it('a entrega carrega os links dos arquivos', () => {
    const [s] = projectTimelineSteps([
      { type: 'project_delivered', message: 'ok', createdAt: ts('2026-09-05T10:00:00Z'), links: [{ label: 'layout.pdf', url: 'https://x/l.pdf' }, { label: 'sem url', url: '' }] },
    ]);
    expect(s.links).toEqual([{ label: 'layout.pdf', url: 'https://x/l.pdf' }]);
  });

  it('evento sem data não quebra e vai para o começo', () => {
    const steps = projectTimelineSteps([
      { type: 'project_delivered', message: 'b', createdAt: ts('2026-09-05T10:00:00Z') },
      { type: 'project_requested', message: 'a' },
    ]);
    expect(steps[0].text).toBe('a');
    expect(steps[0].at).toBeNull();
  });

  it('lista vazia', () => { expect(projectTimelineSteps([])).toEqual([]); });
});
