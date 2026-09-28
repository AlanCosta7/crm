/**
 * TemplatesConfigPage.test.tsx — Administração de Templates de Mensagem.
 *
 * Estratégia: mock dos hooks Firestore (mesmo padrão de LeadSourcesPane.test.tsx).
 * Cobre o achado crítico do PLANO_DESENHO_CRM.md: a tela precisa deixar claro
 * quais variáveis de merge existem e avisar quando o template usa uma que não
 * existe no contexto real (o bug original com {{companyName}}).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TemplatesConfigPage from './TemplatesConfigPage';

const { mockMutations, collections } = vi.hoisted(() => ({
  mockMutations: {
    addDocument: vi.fn().mockResolvedValue({ id: 'new-tpl' }),
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

const TEMPLATE = {
  id: 'tpl-1',
  name: 'Primeiro contato — WizMart',
  funnelType: 'main',
  activityType: 'email',
  role: 'sdr',
  productId: 'wizmart',
  subject: 'Olá {{contato}}, conheça o WizMart!',
  body: 'Olá {{contato}},\n\nA {{empresa}} vai adorar.\n\n{{vendedor}}',
  variables: ['contato', 'empresa', 'vendedor'],
  isActive: true,
  usageCount: 14,
};

function setup(templates: unknown[] = []) {
  collections.current = { templates };
  return render(<TemplatesConfigPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TemplatesConfigPage', () => {
  it('mostra estado vazio', () => {
    setup();
    expect(screen.getByText(/Nenhum template cadastrado/i)).toBeInTheDocument();
  });

  it('lista template com canal e contador de uso', () => {
    setup([TEMPLATE]);
    expect(screen.getByText('Primeiro contato — WizMart')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('mostra o catálogo de variáveis disponíveis ao abrir o formulário', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    for (const v of ['contato', 'empresa', 'vendedor', 'negocio', 'valor', 'produto']) {
      expect(screen.getByText(`{{${v}}}`)).toBeInTheDocument();
    }
  });

  it('avisa quando o template usa uma variável que não existe no contexto real', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    fireEvent.change(screen.getByPlaceholderText(/A \{\{empresa\}\} pode/), {
      target: { value: 'Olá {{companyName}}, tudo bem?' },
    });
    const warning = screen.getByText(/Variável sem valor real/);
    expect(warning.textContent).toContain('{{companyName}}');
  });

  it('não avisa quando só usa variáveis conhecidas', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    fireEvent.change(screen.getByPlaceholderText(/A \{\{empresa\}\} pode/), {
      target: { value: 'Olá {{contato}}, a {{empresa}} agradece.' },
    });
    expect(screen.queryByText(/sem valor real/)).toBeNull();
  });

  it('preview ao vivo renderiza com dados de exemplo', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    fireEvent.change(screen.getByPlaceholderText(/A \{\{empresa\}\} pode/), {
      target: { value: 'Olá {{contato}}, da equipe {{vendedor}}.' },
    });
    expect(screen.getByText(/Olá Maria Silva, da equipe João Vendedor\./)).toBeInTheDocument();
  });

  it('canal WhatsApp esconde o campo Assunto', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    expect(screen.getByPlaceholderText(/Olá \{\{contato\}\}, conheça o WizMart/)).toBeInTheDocument();

    const [canalSelect] = screen.getAllByRole('combobox');
    fireEvent.change(canalSelect, { target: { value: 'whatsapp' } });

    expect(screen.queryByPlaceholderText(/Olá \{\{contato\}\}, conheça o WizMart/)).toBeNull();
  });

  it('cria template: extrai as variáveis usadas e salva com isActive/usageCount padrão', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Novo Template/i }));
    fireEvent.change(screen.getByPlaceholderText(/Primeiro contato — WizMart/i), {
      target: { value: 'Follow-up — Smart Café' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Olá \{\{contato\}\}, conheça o WizMart/), {
      target: { value: 'Olá {{contato}}!' },
    });
    fireEvent.change(screen.getByPlaceholderText(/A \{\{empresa\}\} pode/), {
      target: { value: 'Olá {{contato}}, a {{empresa}} agradece o contato de {{vendedor}}.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Criar template/i }));

    await waitFor(() => expect(mockMutations.addDocument).toHaveBeenCalledTimes(1));
    const saved = mockMutations.addDocument.mock.calls[0][0];
    expect(saved.name).toBe('Follow-up — Smart Café');
    expect(saved.activityType).toBe('email');
    expect(new Set(saved.variables)).toEqual(new Set(['contato', 'empresa', 'vendedor']));
    expect(saved.isActive).toBe(true);
    expect(saved.usageCount).toBe(0);
  });

  it('editar preenche o formulário com os dados existentes', () => {
    setup([TEMPLATE]);
    fireEvent.click(screen.getByRole('button', { name: /Editar template Primeiro contato — WizMart/i }));

    expect(screen.getByDisplayValue('Primeiro contato — WizMart')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Olá {{contato}}, conheça o WizMart!')).toBeInTheDocument();
  });

  it('ativar/desativar alterna isActive', async () => {
    setup([TEMPLATE]);
    fireEvent.click(screen.getByRole('button', { name: /Desativar template Primeiro contato — WizMart/i }));
    await waitFor(() =>
      expect(mockMutations.updateDocument).toHaveBeenCalledWith('tpl-1', { isActive: false })
    );
  });

  it('exclui com confirmação', async () => {
    setup([TEMPLATE]);
    fireEvent.click(screen.getByRole('button', { name: /Excluir template Primeiro contato — WizMart/i }));
    const dialog = screen.getByText(/Excluir template "Primeiro contato — WizMart"\?/).closest('.modal') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /Excluir definitivamente/i }));
    await waitFor(() => expect(mockMutations.deleteDocument).toHaveBeenCalledWith('tpl-1'));
  });
});
