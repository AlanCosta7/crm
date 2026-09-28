/**
 * ChangeResponsibleModal — busca, grupos por papel, seleção e teclado.
 *
 * O bug original era de layout (lista longa sem rolagem, botões fora da tela);
 * o layout em si foi conferido no navegador. Aqui ficam os comportamentos que
 * dão para provar sem layout: a lista grande ganha busca e grupos, a lista
 * pequena não, e a confirmação só sai com alguém selecionado.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChangeResponsibleModal } from './ChangeResponsibleModal';

const person = (id: string, name: string, role: string) =>
  ({ id, name, role, email: '', initials: name.slice(0, 2).toUpperCase(), color: '#1A6B1A', last: '', isActive: true }) as any;

const MANY = [
  person('m1', 'Fernando Souza', 'master'),
  person('g1', 'Pedro Moraes', 'manager'),
  person('b1', 'Daísa Leon', 'bdr'),
  person('s1', 'João Luís', 'sdr'),
  person('s2', 'Marcos Alexandre', 'sdr'),
  person('r1', 'Juliana Ribeiro', 'rep'),
  person('r2', 'Priscilla Caldas', 'rep'),
];
const FEW = [person('s1', 'João Luís', 'sdr'), person('s2', 'Marcos Alexandre', 'sdr')];

const deal = (extra = {}) => ({ id: 'd1', name: 'Cliente Teste', productId: 'wizmart', owner: '', ...extra }) as any;

function setup(candidates: any[], dealExtra = {}, over: Partial<{ onConfirm: any; onCancel: any }> = {}) {
  const onConfirm = over.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = over.onCancel ?? vi.fn();
  render(<ChangeResponsibleModal deal={deal(dealExtra)} currentName="Sem responsável" candidates={candidates} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

describe('ChangeResponsibleModal — lista grande', () => {
  it('mostra busca e agrupa por papel quando há vários papéis', () => {
    setup(MANY);
    expect(screen.getByPlaceholderText(/buscar entre 7 pessoas/i)).toBeInTheDocument();
    for (const g of ['Admin Master', 'Gestores', 'BDRs', 'SDRs', 'Representantes']) {
      expect(screen.getByText(new RegExp(`^${g} · \\d+$`, 'i'))).toBeInTheDocument();
    }
  });

  it('busca ignora acento e maiúscula ("joao" acha "João Luís")', () => {
    setup(MANY);
    fireEvent.change(screen.getByLabelText(/buscar responsável por nome/i), { target: { value: 'JOAO' } });
    expect(screen.getByText('João Luís')).toBeInTheDocument();
    expect(screen.queryByText('Marcos Alexandre')).not.toBeInTheDocument();
    expect(screen.queryByText('Fernando Souza')).not.toBeInTheDocument();
  });

  it('busca sem resultado mostra mensagem, não uma lista vazia muda', () => {
    setup(MANY);
    fireEvent.change(screen.getByLabelText(/buscar responsável por nome/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/ninguém encontrado para/i)).toBeInTheDocument();
  });
});

describe('ChangeResponsibleModal — lista pequena', () => {
  it('sem busca e sem cabeçalhos de grupo (um papel só, poucas pessoas)', () => {
    setup(FEW, { assignedSdrId: 'x' });
    expect(screen.queryByLabelText(/buscar responsável por nome/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SDRs · \d/)).not.toBeInTheDocument();
    expect(screen.getByText('João Luís')).toBeInTheDocument();
  });

  it('sem candidatos: avisa e não deixa confirmar', () => {
    setup([]);
    expect(screen.getByText(/nenhum outro usuário ativo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trocar responsável/i })).toBeDisabled();
  });
});

describe('ChangeResponsibleModal — confirmação', () => {
  it('sem seleção: mostra erro e NÃO chama onConfirm', async () => {
    const { onConfirm } = setup(FEW, { assignedSdrId: 'x' });
    fireEvent.click(screen.getByRole('button', { name: /trocar responsável/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/selecione quem será o novo responsável/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('seleciona, mostra "Novo: …" no rodapé e confirma com uid e motivo', async () => {
    const { onConfirm } = setup(FEW, { assignedSdrId: 'x' });
    fireEvent.click(screen.getByRole('radio', { name: /joão luís/i }));
    expect(screen.getByText(/novo:/i)).toHaveTextContent('Novo: João Luís');
    fireEvent.change(screen.getByPlaceholderText(/reequilíbrio de carteira/i), { target: { value: '  férias  ' } });
    fireEvent.click(screen.getByRole('button', { name: /trocar responsável/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ newUid: 's1', notes: 'férias' }));
  });

  it('permission-denied vira mensagem clara e o modal segue aberto', async () => {
    const onConfirm = vi.fn().mockRejectedValue({ code: 'permission-denied' });
    setup(FEW, { assignedSdrId: 'x' }, { onConfirm });
    fireEvent.click(screen.getByRole('radio', { name: /joão luís/i }));
    fireEvent.click(screen.getByRole('button', { name: /trocar responsável/i }));
    expect(await screen.findByText(/não tem permissão para trocar o responsável/i)).toBeInTheDocument();
  });
});

describe('ChangeResponsibleModal — fechar', () => {
  it('Esc, o X e o botão Cancelar chamam onCancel', () => {
    const { onCancel } = setup(FEW, { assignedSdrId: 'x' });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /^fechar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('é um diálogo acessível (role, aria-modal e título)', () => {
    setup(FEW, { assignedSdrId: 'x' });
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg).toHaveAccessibleName(/trocar responsável/i);
  });
});
