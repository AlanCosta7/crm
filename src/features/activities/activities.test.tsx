import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivitiesPage } from './ActivitiesPage';

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

describe('ActivitiesPage - Timeline de Atividades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoading = false;
    mockActivities = [];
  });

  it('deve exibir mensagem de carregamento se loading for true', () => {
    mockLoading = true;
    render(<ActivitiesPage />);
    expect(screen.getByText('Carregando timeline de atividades...')).toBeInTheDocument();
  });

  it('deve exibir estado vazio se nenhuma atividade for encontrada', () => {
    render(<ActivitiesPage />);
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

    // Clica no filtro "WhatsApp"
    const whatsappFilter = screen.getByText('WhatsApp');
    fireEvent.click(whatsappFilter);

    // Apenas a atividade de WhatsApp deve estar visível
    expect(screen.getByText('enviou mensagem de WhatsApp para cliente')).toBeInTheDocument();
    expect(screen.queryByText('enviou e-mail para cliente')).not.toBeInTheDocument();
  });
});
