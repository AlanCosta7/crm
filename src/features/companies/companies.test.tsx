import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompaniesPage } from './CompaniesPage';

// Mock useAuthStore
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      uid: 'user-1',
      name: 'Test User',
      role: 'master',
      tenantId: 'wizmart_sp',
    },
  }),
}));

// Mock Firestore hooks
let mockCompanies: any[] = [];
let mockLoading = false;

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: () => {
    return { data: mockCompanies, loading: mockLoading };
  },
  useFirestoreMutations: () => ({
    addDocument: vi.fn(),
  }),
}));

describe('CompaniesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanies = [];
    mockLoading = false;
  });

  it('deve renderizar o estado de carregamento', () => {
    mockLoading = true;
    render(<CompaniesPage />);
    expect(screen.getByText('Carregando empresas...')).toBeInTheDocument();
  });

  it('deve renderizar o estado vazio se não houver empresas', () => {
    render(<CompaniesPage />);
    expect(screen.getByText('Nenhuma empresa cadastrada.')).toBeInTheDocument();
  });

  it('deve renderizar a lista de empresas com sucesso, incluindo itens com valores undefined', () => {
    mockCompanies = [
      {
        name: 'Empresa Completa Ltda',
        segment: 'Distribuição',
        deals: 5,
        value: 12000,
      },
      {
        name: 'Empresa Incompleta SA',
        segment: 'Atacado',
        deals: undefined, // Testa se lida corretamente com undefined
        value: undefined, // Testa se lida corretamente com undefined
      },
    ];

    render(<CompaniesPage />);

    // Verifica se os nomes estão na tela
    expect(screen.getByText('Empresa Completa Ltda')).toBeInTheDocument();
    expect(screen.getByText('Empresa Incompleta SA')).toBeInTheDocument();

    // Verifica se o valor formatado da empresa completa é exibido
    expect(screen.getByText('R$ 12.000')).toBeInTheDocument();

    // O valor undefined deve cair no fallback e renderizar R$ 0 de forma segura
    expect(screen.getAllByText('R$ 0').length).toBeGreaterThanOrEqual(1);

    // Verifica contagem de negócios
    expect(screen.getByText('5 negócios')).toBeInTheDocument();
    expect(screen.getByText('0 negócios')).toBeInTheDocument();
  });
});
