import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactsPage } from './ContactsPage';

// Botão "Novo Negócio" do detalhe navega para /pipeline
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

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

// Mock useUIStore
vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({
    productId: 'wizmart',
  }),
}));

// Mock Firestore hooks
let mockContacts: any[] = [];
let mockDeals: any[] = [];
let mockLoading = false;
const mockAddDocument = vi.fn();

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (colName: string) => {
    if (colName === 'contacts') return { data: mockContacts, loading: mockLoading };
    if (colName === 'deals') return { data: mockDeals, loading: false };
    if (colName === 'sellers') return { data: [{ id: 'user-001', name: 'João SDR', initials: 'JS', color: '#1A6B1A' }] };
    return { data: [], loading: false };
  },
  useFirestoreMutations: () => ({
    addDocument: mockAddDocument,
  }),
}));

describe('ContactsPage - UI e Interações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoading = false;
    mockContacts = [];
    mockDeals = [];
  });

  it('deve exibir mensagem de carregamento se loading for true', () => {
    mockLoading = true;
    render(<ContactsPage />);
    expect(screen.getByText('Carregando contatos...')).toBeInTheDocument();
  });

  it('deve exibir estado vazio se nenhum contato for retornado', () => {
    render(<ContactsPage />);
    expect(screen.getByText('Nenhum contato encontrado')).toBeInTheDocument();
  });

  it('deve renderizar a tabela com contatos cadastrados', () => {
    mockContacts = [
      {
        id: 'contact-1',
        name: 'Roberto Vendedor',
        company: 'Supermercado Roberto',
        email: 'roberto@email.com',
        phone: '11999991111',
        whats: '11999991111',
        owner: 'user-001',
        last: 'há 2 horas',
        tags: ['Novo'],
        deals: 1,
      },
    ];

    render(<ContactsPage />);

    expect(screen.getByText('Roberto Vendedor')).toBeInTheDocument();
    expect(screen.getByText('Supermercado Roberto')).toBeInTheDocument();
    expect(screen.getByText('roberto@email.com')).toBeInTheDocument();
  });

  it('deve alternar para a página de detalhes ao clicar no link do contato', () => {
    mockContacts = [
      {
        id: 'contact-1',
        name: 'Roberto Vendedor',
        company: 'Supermercado Roberto',
        email: 'roberto@email.com',
        phone: '11999991111',
        whats: '11999991111',
        owner: 'user-001',
        last: 'há 2 horas',
        tags: ['Novo'],
        deals: 1,
        role: 'Gerente',
      },
    ];

    render(<ContactsPage />);

    const link = screen.getByRole('button', { name: 'Roberto Vendedor' });
    fireEvent.click(link);

    // Deve exibir detalhes do contato
    expect(screen.getByText('Voltar para Contatos')).toBeInTheDocument();
    expect(screen.getByText('Gerente')).toBeInTheDocument();
  });

  it('deve abrir o modal de novo contato e registrar com sucesso', async () => {
    mockContacts = [];
    render(<ContactsPage />);

    // Clica no botão "Novo Contato"
    const newContactBtn = screen.getByText('Novo Contato');
    fireEvent.click(newContactBtn);

    // Modal deve estar aberto
    expect(screen.getByText('Cadastrar Novo Contato')).toBeInTheDocument();

    // Preenche os campos obrigatórios
    const nameInput = screen.getByPlaceholderText('Nome completo');
    const companyInput = screen.getByPlaceholderText('Razão social ou nome fantasia');

    fireEvent.change(nameInput, { target: { value: 'Marcos Comprador' } });
    fireEvent.change(companyInput, { target: { value: 'Marcos Distribuidora' } });

    // Envia o formulário
    const submitBtn = screen.getByRole('button', { name: 'Cadastrar' });
    fireEvent.click(submitBtn);

    // Deve chamar addDocument
    await waitFor(() => {
      expect(mockAddDocument).toHaveBeenCalled();
    });
  });
});
