import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactSelector } from './ContactSelector';
import type { Contact } from '../../types/crm';

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c1',
    name: 'Roberto Vendedor',
    role: 'Comprador',
    company: 'Empresa X',
    email: 'roberto@empresax.com',
    phone: '11999991111',
    whats: '11999991111',
    owner: 'user-1',
    last: '',
    tags: [],
    deals: 0,
    ...overrides,
  };
}

describe('ContactSelector', () => {
  it('mostra estado vazio quando o deal não tem contactId e não há match por empresa', () => {
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: undefined }}
        contacts={[]}
        onLink={vi.fn()}
        onCreateContact={vi.fn()}
      />
    );
    expect(screen.getByText(/Nenhum contato vinculado/)).toBeInTheDocument();
    expect(screen.getByText('Vincular contato')).toBeInTheDocument();
  });

  it('exibe nome, email e whatsapp do contato resolvido via contactId', () => {
    const contacts = [contact({ id: 'c1' }), contact({ id: 'c2', company: 'Outra Empresa' })];
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: 'c1' }}
        contacts={contacts}
        onLink={vi.fn()}
        onCreateContact={vi.fn()}
      />
    );
    expect(screen.getByText('Roberto Vendedor')).toBeInTheDocument();
    expect(screen.getByText('roberto@empresax.com')).toBeInTheDocument();
    expect(screen.getByText('11999991111')).toBeInTheDocument();
    expect(screen.getByText('Trocar')).toBeInTheDocument();
  });

  it('não mostra o botão de trocar/vincular quando readOnly', () => {
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: undefined }}
        contacts={[]}
        onLink={vi.fn()}
        onCreateContact={vi.fn()}
        readOnly
      />
    );
    expect(screen.queryByText('Vincular contato')).not.toBeInTheDocument();
  });

  it('ao clicar em um contato candidato (mesma empresa), chama onLink com o id dele', async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    // c1 já resolve por fallback (mesma empresa, sem contactId) — o caso de
    // uso real do picker aqui é trocar para o outro contato da empresa, c2.
    const contacts = [contact({ id: 'c1', name: 'Roberto Vendedor' }), contact({ id: 'c2', name: 'Ana Compradora' })];
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: undefined }}
        contacts={contacts}
        onLink={onLink}
        onCreateContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Trocar'));
    fireEvent.click(screen.getByText(/Ana Compradora/));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith('c2'));
  });

  it('cria um novo contato inline e vincula o id retornado', async () => {
    const onCreateContact = vi.fn().mockResolvedValue('novo-id');
    const onLink = vi.fn().mockResolvedValue(undefined);
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: undefined }}
        contacts={[]}
        onLink={onLink}
        onCreateContact={onCreateContact}
      />
    );
    fireEvent.click(screen.getByText('Vincular contato'));
    fireEvent.click(screen.getByText('Novo contato'));
    fireEvent.change(screen.getByPlaceholderText('Nome *'), { target: { value: 'Novo Contato' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'novo@empresax.com' } });
    fireEvent.click(screen.getByText('Criar e vincular'));

    await waitFor(() => expect(onCreateContact).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Novo Contato', email: 'novo@empresax.com' })
    ));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith('novo-id'));
  });

  it('exige o nome ao criar um novo contato', () => {
    render(
      <ContactSelector
        deal={{ company: 'Empresa X', contactId: undefined }}
        contacts={[]}
        onLink={vi.fn()}
        onCreateContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Vincular contato'));
    fireEvent.click(screen.getByText('Novo contato'));
    fireEvent.click(screen.getByText('Criar e vincular'));
    expect(screen.getByText('Informe o nome do contato.')).toBeInTheDocument();
  });
});
