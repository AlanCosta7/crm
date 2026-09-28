/**
 * cadencia.test.tsx — Testes da tela de Cadência Diária
 *
 * Estratégia: mock do hook useCadencia + mock das stores para testar
 * a renderização condicional sem dependência de Firebase.
 *
 * Cobre:
 *  - Estado de carregamento (skeleton)
 *  - Estado vazio (sem cards)
 *  - Renderização de cards com atividades
 *  - Exibição de taxa de conclusão
 *  - Abertura do CompleteActivityModal ao clicar em atividade
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CadenciaPage } from './CadenciaPage';
import type { DailyQueue } from '../../utils/cadenceUtils';

// ── Mocks globais ─────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { animeStub } = vi.hoisted(() => {
  const stub = Object.assign(() => {}, { timeline: () => ({ add: () => ({}) }), stagger: () => 0 });
  return { animeStub: stub };
});
vi.mock('animejs', () => ({ default: animeStub }));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { uid: 'sdr-001', name: 'João SDR', role: 'sdr', tenantId: 'wm_sp', coinBalance: 15 },
  }),
}));

const { mockProductScope } = vi.hoisted(() => ({
  mockProductScope: vi.fn(() => 'all'),
}));
vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({
    productScope: mockProductScope(),
  }),
}));

const mockUseCadencia = vi.fn();
vi.mock('./useCadencia', () => ({ useCadencia: () => mockUseCadencia() }));

// Alertas de agenda leem a coleção activities via useFirestore — mock vazio
vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: () => ({ data: [], loading: false, error: null }),
  useFirestoreMutations: () => ({ addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() }),
}));

// Mock do CompleteActivityModal para simplificar testes de interação
vi.mock('./CompleteActivityModal', () => ({
  CompleteActivityModal: ({ onCancel }: any) => (
    <div data-testid="complete-modal">
      <button onClick={onCancel}>Fechar modal</button>
    </div>
  ),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeQueue(overrides: Partial<DailyQueue> = {}): DailyQueue {
  const cardsDistributed = overrides.cardsDistributed ?? 2;

  const baseCards = [
    {
      dealId: 'deal-001',
      contactName: 'Carlos Mendes',
      companyName: 'WizDist SP',
      productId: 'wizmart',
      isNew: true,
      activities: {
        email:    { type: 'email',    status: 'pending',   activityId: 'act-e1' },
        linkedin: { type: 'linkedin', status: 'pending',   activityId: 'act-l1' },
        whatsapp: { type: 'whatsapp', status: 'completed', activityId: 'act-w1' },
        call:     { type: 'call',     status: 'pending',   activityId: 'act-c1' },
      },
    },
  ];

  // Adiciona segundo card se cardsDistributed for 2 ou mais
  if (cardsDistributed >= 2) {
    baseCards.push({
      dealId: 'deal-002',
      contactName: 'Ana Silva',
      companyName: 'TechCorp RJ',
      productId: 'wizmart',
      isNew: false,
      activities: {
        email:    { type: 'email',    status: 'pending',   activityId: 'act-e2' },
        linkedin: { type: 'linkedin', status: 'pending',   activityId: 'act-l2' },
        whatsapp: { type: 'whatsapp', status: 'pending',   activityId: 'act-w2' },
        call:     { type: 'call',     status: 'pending',   activityId: 'act-c2' },
      },
    });
  }

  return {
    sdrId: 'sdr-001',
    date: '2026-06-05',
    cardsDistributed,
    previousCompletionRate: 1,
    activitiesRequired: 8,
    activitiesCompleted: 0,
    completionRate: 0,
    cards: baseCards as any,
    ...overrides,
  };
}

function makeLoadingState() {
  return { queue: null, loading: true, todayKey: '2026-06-05', completionPct: 0, refreshQueue: vi.fn() };
}

function makeReadyState(queue: DailyQueue | null = makeQueue(), completionPct = 12) {
  return { queue, loading: false, todayKey: '2026-06-05', completionPct, refreshQueue: vi.fn() };
}

// ── Testes ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockProductScope.mockReturnValue('all');
});

describe('CadenciaPage — estados de carregamento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe skeleton durante carregamento', () => {
    mockUseCadencia.mockReturnValue(makeLoadingState());
    render(<CadenciaPage />);
    expect(screen.getByText('Cadência Diária')).toBeInTheDocument();
    // Skeletons são divs com classe "sk" — verifica ausência dos cards
    expect(screen.queryByText('Carlos Mendes')).toBeNull();
  });

  it('exibe estado vazio quando não há cards', () => {
    mockUseCadencia.mockReturnValue(makeReadyState(null, 0));
    render(<CadenciaPage />);
    expect(screen.getByText(/fila de hoje ainda não foi gerada/i)).toBeInTheDocument();
  });

  it('exibe estado vazio quando queue existe mas cards = []', () => {
    const emptyQueue = makeQueue({ cards: [], cardsDistributed: 0, activitiesRequired: 0 });
    mockUseCadencia.mockReturnValue(makeReadyState(emptyQueue, 100));
    render(<CadenciaPage />);
    expect(screen.getByText(/Cadência completa/i)).toBeInTheDocument();
  });
});

describe('CadenciaPage — renderização de cards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe o nome do contato e empresa', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    expect(screen.getByText('WizDist SP')).toBeInTheDocument();
  });

  it('exibe badge "Novo hoje" para cards novos', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    expect(screen.getByText(/Novo hoje/i)).toBeInTheDocument();
  });

  it('exibe os 4 tipos de atividade', () => {
    mockUseCadencia.mockReturnValue(makeReadyState(makeQueue({ cardsDistributed: 1 })));
    render(<CadenciaPage />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Ligação')).toBeInTheDocument();
  });

  it('atividade concluída exibe "✓ feito"', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    // WhatsApp está como completed no makeQueue
    expect(screen.getByText('✓ feito')).toBeInTheDocument();
  });
});

describe('CadenciaPage — métricas de progresso', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exibe taxa de conclusão corretamente', () => {
    mockUseCadencia.mockReturnValue(makeReadyState(makeQueue({ cardsDistributed: 1 }), 25));
    render(<CadenciaPage />);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('exibe cards hoje correto', () => {
    mockUseCadencia.mockReturnValue(makeReadyState(makeQueue({ cardsDistributed: 2 })));
    render(<CadenciaPage />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('exibe moedas do ciclo do usuário', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    expect(screen.getByText('15')).toBeInTheDocument(); // coinBalance do user mockado
  });

  it('não exibe mais previsão de novos cards (a atribuição de leads é manual)', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    expect(screen.queryByText('Previsão Amanhã')).not.toBeInTheDocument();
  });
});

describe('CadenciaPage — interação', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clique em atividade pendente abre CompleteActivityModal', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    // Clica no botão "Email" (status pending, activityId = act-e1)
    const emailBtn = document.getElementById('act-btn-act-e1');
    expect(emailBtn).not.toBeNull();
    fireEvent.click(emailBtn!);
    expect(screen.getByTestId('complete-modal')).toBeInTheDocument();
  });

  it('clique em atividade completada NÃO abre modal', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    // WhatsApp está completed — botão deve estar disabled
    const whatsBtn = document.getElementById('act-btn-act-w1');
    expect(whatsBtn).toBeDisabled();
    fireEvent.click(whatsBtn!);
    expect(screen.queryByTestId('complete-modal')).toBeNull();
  });

  it('fechar modal remove o CompleteActivityModal', () => {
    mockUseCadencia.mockReturnValue(makeReadyState());
    render(<CadenciaPage />);
    const emailBtn = document.getElementById('act-btn-act-e1');
    fireEvent.click(emailBtn!);
    expect(screen.getByTestId('complete-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fechar modal'));
    expect(screen.queryByTestId('complete-modal')).toBeNull();
  });

  it('botão Atualizar chama refreshQueue', () => {
    const refreshFn = vi.fn();
    mockUseCadencia.mockReturnValue({ ...makeReadyState(), refreshQueue: refreshFn });
    render(<CadenciaPage />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/i }));
    expect(refreshFn).toHaveBeenCalledOnce();
  });
});

describe('CadenciaPage — segmentação por produto', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filtra cards de acordo com o productScope selecionado', () => {
    mockProductScope.mockReturnValue('wizmart');
    const queue = makeQueue({
      cards: [
        {
          dealId: 'deal-001',
          contactName: 'Carlos Mendes',
          companyName: 'WizDist SP',
          productId: 'wizmart',
          isNew: true,
          activities: {
            email:    { type: 'email',    status: 'pending',   activityId: 'act-e1' },
            linkedin: { type: 'linkedin', status: 'pending',   activityId: 'act-l1' },
            whatsapp: { type: 'whatsapp', status: 'completed', activityId: 'act-w1' },
            call:     { type: 'call',     status: 'pending',   activityId: 'act-c1' },
          },
        },
        {
          dealId: 'deal-002',
          contactName: 'Maria Café',
          companyName: 'Smart Café Centro',
          productId: 'smart_cafe',
          isNew: false,
          activities: {
            email:    { type: 'email',    status: 'pending',   activityId: 'act-e2' },
            linkedin: { type: 'linkedin', status: 'pending',   activityId: 'act-l2' },
            whatsapp: { type: 'whatsapp', status: 'pending',   activityId: 'act-w2' },
            call:     { type: 'call',     status: 'pending',   activityId: 'act-c2' },
          },
        },
      ] as any,
    });
    mockUseCadencia.mockReturnValue(makeReadyState(queue));
    render(<CadenciaPage />);

    // Deve exibir o card do WizMart (Carlos Mendes)
    expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    expect(screen.getByText('WizDist SP')).toBeInTheDocument();

    // NÃO deve exibir o card do Smart Café (Maria Café)
    expect(screen.queryByText('Maria Café')).toBeNull();
    expect(screen.queryByText('Smart Café Centro')).toBeNull();
  });

  it('recalcula o progresso e métricas considerando apenas os cards do escopo ativo', () => {
    mockProductScope.mockReturnValue('smart_cafe');
    const queue = makeQueue({
      cards: [
        {
          dealId: 'deal-001',
          contactName: 'Carlos Mendes',
          companyName: 'WizDist SP',
          productId: 'wizmart',
          isNew: true,
          activities: {
            email:    { type: 'email',    status: 'completed', activityId: 'act-e1' },
            linkedin: { type: 'linkedin', status: 'completed', activityId: 'act-l1' },
            whatsapp: { type: 'whatsapp', status: 'completed', activityId: 'act-w1' },
            call:     { type: 'call',     status: 'completed', activityId: 'act-c1' },
          },
        },
        {
          dealId: 'deal-002',
          contactName: 'Maria Café',
          companyName: 'Smart Café Centro',
          productId: 'smart_cafe',
          isNew: false,
          activities: {
            email:    { type: 'email',    status: 'pending',   activityId: 'act-e2' },
            linkedin: { type: 'linkedin', status: 'pending',   activityId: 'act-l2' },
            whatsapp: { type: 'whatsapp', status: 'pending',   activityId: 'act-w2' },
            call:     { type: 'call',     status: 'pending',   activityId: 'act-c2' },
          },
        },
      ] as any,
    });
    mockUseCadencia.mockReturnValue(makeReadyState(queue));
    render(<CadenciaPage />);

    // Progresso do Smart Café deve ser 0% (0 de 4 concluídas), não 50% (4 de 8 concluídas)
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 de 4 atividades')).toBeInTheDocument();
    expect(screen.queryByText('4 de 8 atividades')).toBeNull();
  });
});
