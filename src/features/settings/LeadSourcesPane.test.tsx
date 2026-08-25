/**
 * LeadSourcesPane.test.tsx — Aba "Captação de Leads" das Configurações.
 *
 * Estratégia: mock de stores + hooks Firestore (mesmo padrão do dashboard.test).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LeadSourcesPane } from './LeadSourcesPane';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockMutations, collections } = vi.hoisted(() => ({
  mockMutations: {
    addDocument: vi.fn().mockResolvedValue({ id: 'new-src' }),
    updateDocument: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    setDocument: vi.fn().mockResolvedValue(undefined),
  },
  collections: { current: {} as Record<string, unknown[]> },
}));

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => ({
    data: collections.current[name] ?? [],
    loading: false,
    error: null,
  }),
  useFirestoreMutations: () => mockMutations,
}));

const mockUseAuthStore = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

const FUNNELS = [
  { id: 'inbound-wizmart', name: 'Inbound — WizMart', productId: 'wizmart', type: 'inbound', isActive: true, stages: [], color: '#1A6B1A' },
];

const SOURCE = {
  id: 'src-1',
  name: 'LP Smart Café',
  apiKeyHash: 'f'.repeat(64),
  apiKeyPrefix: 'wzk_abcd1234…',
  allowedOrigins: ['https://lp.wizmart.com.br'],
  funnelId: 'inbound-wizmart',
  productId: 'wizmart',
  defaultOwner: '',
  turnstileEnabled: false,
  isActive: true,
  stats: { received: 12, blocked: 3 },
};

function setup(role: 'master' | 'manager' = 'master', sources: unknown[] = []) {
  collections.current = { lead_sources: sources, funnels: FUNNELS, users: [] };
  mockUseAuthStore.mockReturnValue({ user: { uid: 'u1', role, tenantId: 'wizmart' } });
  return render(<LeadSourcesPane />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Testes ────────────────────────────────────────────────────────────────────

describe('LeadSourcesPane', () => {
  it('mostra estado vazio e o endpoint de captação', () => {
    setup();
    expect(screen.getByText(/Nenhuma fonte cadastrada/i)).toBeInTheDocument();
    expect(screen.getByText(/wizmart-crm\.web\.app\/api\/leads/)).toBeInTheDocument();
  });

  it('lista fonte com prefixo da chave e contadores', () => {
    setup('master', [SOURCE]);
    expect(screen.getByText('LP Smart Café')).toBeInTheDocument();
    expect(screen.getByText('wzk_abcd1234…')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // recebidos
    expect(screen.getByText('3')).toBeInTheDocument();  // bloqueados
  });

  it('cria fonte: grava só o hash e exibe a chave uma única vez', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Nova Fonte/i }));
    fireEvent.change(screen.getByPlaceholderText(/Landing Page Smart Café/i), {
      target: { value: 'Site Institucional' },
    });
    fireEvent.change(screen.getByPlaceholderText(/wizmart\.com\.br/i), {
      target: { value: 'https://wizmart.com.br' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Criar fonte e gerar chave/i }));

    // modal de chave revelada aparece com formato wzk_ (timeout maior:
    // crypto.subtle fica lento quando a suíte roda em paralelo)
    const revealed = await screen.findByTestId('revealed-key', {}, { timeout: 4000 });
    expect(revealed.textContent).toMatch(/^wzk_[A-Za-z0-9_-]{43}$/);

    // addDocument recebeu hash (64 hex) e NUNCA a chave em claro
    expect(mockMutations.addDocument).toHaveBeenCalledTimes(1);
    const saved = mockMutations.addDocument.mock.calls[0][0];
    expect(saved.name).toBe('Site Institucional');
    expect(saved.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.isActive).toBe(true);
    expect(saved.allowedOrigins).toEqual(['https://wizmart.com.br']);
    expect(JSON.stringify(saved)).not.toContain(revealed.textContent);
  });

  it('kill-switch: desativa a fonte com um clique', async () => {
    setup('master', [SOURCE]);
    fireEvent.click(screen.getByRole('button', { name: /Desativar fonte LP Smart Café/i }));
    await waitFor(() =>
      expect(mockMutations.updateDocument).toHaveBeenCalledWith('src-1', { isActive: false })
    );
  });

  it('rotacionar chave: atualiza o hash e revela a nova chave', async () => {
    setup('master', [SOURCE]);
    fireEvent.click(screen.getByRole('button', { name: /Rotacionar chave de LP Smart Café/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rotacionar agora/i }));

    const revealed = await screen.findByTestId('revealed-key');
    expect(revealed.textContent).toMatch(/^wzk_/);
    const [id, fields] = mockMutations.updateDocument.mock.calls[0];
    expect(id).toBe('src-1');
    expect(fields.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fields.apiKeyHash).not.toBe(SOURCE.apiKeyHash);
  });

  it('excluir só aparece para master', () => {
    setup('manager', [SOURCE]);
    expect(screen.queryByRole('button', { name: /Excluir fonte/i })).toBeNull();
  });

  it('master exclui com confirmação', async () => {
    setup('master', [SOURCE]);
    fireEvent.click(screen.getByRole('button', { name: /Excluir fonte LP Smart Café/i }));
    fireEvent.click(screen.getByRole('button', { name: /Excluir definitivamente/i }));
    await waitFor(() => expect(mockMutations.deleteDocument).toHaveBeenCalledWith('src-1'));
  });
});
