import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksPage } from './TasksPage';

// Mock animejs
vi.mock('animejs', () => ({
  default: vi.fn(),
  timeline: () => ({
    add: vi.fn().mockReturnThis(),
  }),
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
let mockDeals: any[] = [];
const mockUpdateDocument = vi.fn();

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (colName: string) => {
    if (colName === 'deals') return { data: mockDeals };
    if (colName === 'sellers') return { data: [{ id: 'user-001', name: 'João SDR', initials: 'JS', color: '#1A6B1A' }] };
    return { data: [] };
  },
  useFirestoreMutations: () => ({
    updateDocument: mockUpdateDocument,
  }),
}));

describe('TasksPage - UI e Integrações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeals = [];
  });

  it('deve renderizar o estado vazio padrão de tarefas pendentes', () => {
    render(<TasksPage />);
    expect(screen.getByText('Nenhuma tarefa pendente!')).toBeInTheDocument();
    expect(screen.getByText('Parabéns! Todas as tarefas estão em dia.')).toBeInTheDocument();
  });

  it('deve renderizar os negócios que possuem tarefas pendentes', () => {
    mockDeals = [
      {
        id: 'deal-1',
        name: 'Supermercado Silva',
        company: 'Silva Distr.',
        value: 15000,
        owner: 'user-001',
        tasks: { e: false, w: false, m: false },
      },
    ];

    render(<TasksPage />);

    expect(screen.getByText('Supermercado Silva')).toBeInTheDocument();
    expect(screen.getByText('Silva Distr. · R$ 15.000')).toBeInTheDocument();
    expect(screen.getByText('0/3')).toBeInTheDocument();
  });

  it('deve alternar a exibição ao clicar nas abas de filtros', () => {
    mockDeals = [
      {
        id: 'deal-1',
        name: 'Supermercado Silva',
        company: 'Silva Distr.',
        value: 15000,
        owner: 'user-001',
        tasks: { e: true, w: true, m: true }, // Tudo concluído
      },
    ];

    render(<TasksPage />);

    // Na aba "Pendentes" (padrão), não deve exibir nada porque está concluído
    expect(screen.queryByText('Supermercado Silva')).not.toBeInTheDocument();

    // Clica na aba "Concluídas"
    const finishedTab = screen.getByText('Concluídas');
    fireEvent.click(finishedTab);

    // Deve exibir o negócio concluído
    expect(screen.getByText('Supermercado Silva')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('deve disparar a conclusão de uma tarefa quando clicada', async () => {
    const deal = {
      id: 'deal-1',
      name: 'Supermercado Silva',
      company: 'Silva Distr.',
      value: 15000,
      owner: 'user-001',
      tasks: { e: false, w: true, m: true },
    };
    mockDeals = [deal];

    render(<TasksPage />);

    // Localiza o botão correspondente à tarefa Email (e)
    const emailBtn = screen.getByText('Email');
    fireEvent.click(emailBtn);

    // Deve chamar updateDocument salvando a tarefa como true
    expect(mockUpdateDocument).toHaveBeenCalledWith('deal-1', {
      tasks: { e: true, w: true, m: true },
    });
  });
});
