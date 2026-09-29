/**
 * GamificacaoPane.test.tsx — Aba "Pontuação" das Configurações
 * (PLANO_DESENHO_CRM_2.md — pontuação configurável). Mesmo padrão de mock do
 * TemplatesConfigPage.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GamificacaoPane } from './GamificacaoPane';
import { DEFAULT_ACTION_POINTS, DEFAULT_SDR_RANKING_WEIGHTS } from '../../utils/gamificationSettings';

const { mockMutations, collections, setDocMock } = vi.hoisted(() => ({
  mockMutations: { updateDocument: vi.fn().mockResolvedValue(undefined) },
  collections: { current: {} as Record<string, unknown[]> },
  setDocMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => ({
    data: collections.current[name] ?? [],
    loading: false,
    error: null,
  }),
  useFirestoreMutations: () => mockMutations,
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { tenantId: 'wizmart' } }),
}));

vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ path: 'tenants/wizmart/settings/gamification' }),
  setDoc: setDocMock,
}));

vi.mock('../../config/firebase', () => ({ db: {} }));

vi.mock('./useGamificationSettings', () => ({
  useGamificationSettings: () => ({
    actionPoints: DEFAULT_ACTION_POINTS,
    sdrRankingWeights: DEFAULT_SDR_RANKING_WEIGHTS,
    loading: false,
  }),
}));

const FUNIL = {
  id: 'wizmart', name: 'WizMart',
  stages: [
    { id: 'visita_agendada', name: 'Visita Agendada', order: 1, isConvergencePoint: false, isHandoffRequired: true, coinsOnEnter: 1, pointsOnEnter: 0, slaBusinessDays: 5, defaultTemplateIds: [] },
  ],
};

function setup() {
  collections.current = { funnels: [FUNIL] };
  return render(<GamificacaoPane />);
}

describe('GamificacaoPane', () => {
  it('mostra os padrões (os mesmos valores fixos de antes) quando não há documento salvo', () => {
    setup();
    expect(screen.getByLabelText(/Negócio criado/i)).toHaveValue(5);
    expect(screen.getByLabelText(/Email enviado/i)).toHaveValue(15);
    expect(screen.getByLabelText(/Mensagem WhatsApp/i)).toHaveValue(20);
    expect(screen.getByLabelText(/Reunião \(tarefa do card\)/i)).toHaveValue(30);
    expect(screen.getByLabelText(/Negócio ganho/i)).toHaveValue(100);
    expect(screen.getByLabelText(/Peso — visitas agendadas/i)).toHaveValue(10_000);
  });

  it('editar um ponto e salvar grava o valor novo, mantendo o resto', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/Negócio ganho/i), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar pontuação/i }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, payload, opts] = setDocMock.mock.calls[0];
    expect(payload.actionPoints).toEqual({ ...DEFAULT_ACTION_POINTS, dealWon: 250 });
    expect(payload.sdrRankingWeights).toEqual(DEFAULT_SDR_RANKING_WEIGHTS);
    expect(opts).toEqual({ merge: true });
  });

  it('lista o funil e a etapa, com moedas e pontos editáveis', () => {
    setup();
    expect(screen.getByText('WizMart')).toBeInTheDocument();
    expect(screen.getByText('Visita Agendada')).toBeInTheDocument();
  });

  it('editar os pontos de uma etapa (visita agendada) chama updateFunnel com a etapa atualizada', async () => {
    setup();
    const inputs = screen.getAllByRole('spinbutton'); // todos os <input type=number> da tela
    const pontosDaEtapa = inputs.at(-1)!; // último campo renderizado = pontos da etapa
    fireEvent.change(pontosDaEtapa, { target: { value: '25' } });
    fireEvent.blur(pontosDaEtapa);

    await waitFor(() => expect(mockMutations.updateDocument).toHaveBeenCalled());
    const [funnelId, patch] = mockMutations.updateDocument.mock.calls[0];
    expect(funnelId).toBe('wizmart');
    expect(patch.stages[0]).toMatchObject({ id: 'visita_agendada', pointsOnEnter: 25, coinsOnEnter: 1 });
  });
});
