/**
 * activities.test.tsx — timeline (aba Histórico) da página de Atividades
 *
 * Desde a Fase 2 do PLANO_DESENHO_CRM.md a página tem duas abas, e o SDR abre
 * na fila do dia ("Meu Dia"). A timeline que estes testes cobrem passou a viver
 * na aba "Histórico" — daí o `abrirHistorico()` antes das asserções.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivitiesPage } from './ActivitiesPage';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

// A tela assina `settings/cadence` para ler os blocos de horário. Mockar o
// módulo de config evita inicializar o Firebase de verdade no teste; mockar
// `firebase/firestore` inteiro não serve, porque é o próprio config que chama
// `getFirestore`.
vi.mock('../../config/firebase', () => ({
  db: {}, auth: {}, rtdb: {}, storage: {}, functions: {},
}));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  doc: () => ({}),
  onSnapshot: () => () => {},
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({ productId: 'all', productScope: 'all' }),
}));

// Mock useAuthStore
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      uid: 'user-001',
      name: 'João SDR',
      role: 'sdr',
      tenantId: 'wizmart_sp',
    },
  }),
}));

// Mock Firestore hooks
let mockActivities: any[] = [];
let mockLoading = false;

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (colName: string) => {
    if (colName === 'activity') return { data: mockActivities, loading: mockLoading };
    if (colName === 'sellers') return { data: [{ id: 'user-001', name: 'João SDR', initials: 'JS', color: '#1A6B1A' }] };
    return { data: [] };
  },
}));

/** O SDR abre em "Meu Dia"; a timeline vive na aba "Histórico". */
function abrirHistorico() {
  fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
}

describe('ActivitiesPage - Timeline de Atividades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoading = false;
    mockActivities = [];
  });

  // Fase 2 — slide 9: o SDR entra pela fila do dia, não pelo histórico.
  it('o SDR abre na aba Meu Dia, com a régua de blocos', () => {
    render(<ActivitiesPage />);
    // "Pausa" aparece duas vezes no bloco das 12h: como rótulo e como selo.
    expect(screen.getAllByText('Pausa').length).toBeGreaterThan(0);
    expect(screen.getByText('10h')).toBeInTheDocument();
    expect(screen.getByText('13h–15h')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma atividade registrada')).toBeNull();
  });

  it('deve exibir mensagem de carregamento se loading for true', () => {
    mockLoading = true;
    render(<ActivitiesPage />);
    abrirHistorico();
    expect(screen.getByText('Carregando timeline de atividades...')).toBeInTheDocument();
  });

  it('deve exibir estado vazio se nenhuma atividade for encontrada', () => {
    render(<ActivitiesPage />);
    abrirHistorico();
    expect(screen.getByText('Nenhuma atividade registrada')).toBeInTheDocument();
    expect(screen.getByText('As atividades aparecem automaticamente quando tarefas são concluídas no pipeline.')).toBeInTheDocument();
  });

  it('deve renderizar a timeline de atividades corretamente', () => {
    mockActivities = [
      {
        id: 'act-1',
        type: 'whatsapp',
        userId: 'user-001',
        text: 'enviou mensagem de WhatsApp para cliente',
        val: 'Smart Café',
        time: '05 Jun · 10:15',
      },
      {
        id: 'act-2',
        type: 'email',
        userId: 'user-001',
        text: 'enviou e-mail para cliente',
        val: 'WizMart',
        time: '05 Jun · 10:20',
      },
    ];

    render(<ActivitiesPage />);
    abrirHistorico();

    // Deve mostrar as atividades na timeline
    expect(screen.getByText('enviou mensagem de WhatsApp para cliente')).toBeInTheDocument();
    expect(screen.getByText('enviou e-mail para cliente')).toBeInTheDocument();
    expect(screen.getAllByText('João SDR')).toHaveLength(2);
  });

  it('deve filtrar a timeline por tipo de atividade ao clicar nos chips', () => {
    mockActivities = [
      {
        id: 'act-1',
        type: 'whatsapp',
        userId: 'user-001',
        text: 'enviou mensagem de WhatsApp para cliente',
        val: 'Smart Café',
        time: '05 Jun · 10:15',
      },
      {
        id: 'act-2',
        type: 'email',
        userId: 'user-001',
        text: 'enviou e-mail para cliente',
        val: 'WizMart',
        time: '05 Jun · 10:20',
      },
    ];

    render(<ActivitiesPage />);
    abrirHistorico();

    // Clica no chip "WhatsApp" — getAllByText porque "WhatsApp" também é nome
    // de bloco de horário; o chip é o último da lista de filtros.
    const chips = screen.getAllByText('WhatsApp');
    fireEvent.click(chips[chips.length - 1]);

    // Apenas a atividade de WhatsApp deve estar visível
    expect(screen.getByText('enviou mensagem de WhatsApp para cliente')).toBeInTheDocument();
    expect(screen.queryByText('enviou e-mail para cliente')).not.toBeInTheDocument();
  });
});
