/**
 * completeActivityModal.test.tsx — Fase 3 do PLANO_DESENHO_CRM.md
 *
 * Regressão de um crash: `CompleteActivityModal` lia `ACTIVITY_TYPE_CONFIG`,
 * que só conhece os 4 canais de cadência do SDR, e usava `cfg.label` direto.
 * Para as tarefas da régua de agenda (`agenda`) — e para reunião e visita —
 * `cfg` vinha `undefined` e o modal quebrava ao abrir. Com a fila do dia
 * oferecendo "Registrar" para essas tarefas, o SDR derrubava a tela com um clique.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompleteActivityModal } from './CompleteActivityModal';

vi.mock('../../config/firebase', () => ({ db: {}, auth: {}, rtdb: {}, storage: {}, functions: {} }));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  doc: () => ({}),
  collection: () => ({}),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'sdr-1', tenantId: 'wizmart_sp', role: 'sdr' } }),
}));

function abrir(activityType: string) {
  return render(
    <CompleteActivityModal
      activityId="act-1"
      activityType={activityType}
      dealId="deal-1"
      contactName="Carlos"
      companyName="Mercado do Bairro"
      onSuccess={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

describe('CompleteActivityModal — tipos fora dos 4 canais do SDR', () => {
  it('abre para uma tarefa da régua de agenda sem quebrar', () => {
    abrir('agenda');
    expect(screen.getByText('Registrar Follow-up de agenda')).toBeInTheDocument();
  });

  it('abre para reunião', () => {
    abrir('meeting');
    expect(screen.getByText('Registrar Reunião')).toBeInTheDocument();
  });

  it('abre para visita', () => {
    abrir('visit');
    expect(screen.getByText('Registrar Visita')).toBeInTheDocument();
  });

  it('os canais do SDR seguem com o rótulo de sempre', () => {
    abrir('email');
    expect(screen.getByText('Registrar Email')).toBeInTheDocument();
  });

  it('tipo desconhecido cai num rótulo genérico em vez de quebrar', () => {
    abrir('carta_pombo');
    expect(screen.getByText('Registrar Atividade')).toBeInTheDocument();
  });
});
