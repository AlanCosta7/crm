import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteComposer } from './NoteComposer';

// O composer importa o hook de upload, que importa a config do Firebase — sem
// este mock cada arquivo de teste inicializa o SDK e tenta falar com o
// emulador, o que só torna os testes lentos.
vi.mock('../../../config/firebase', () => ({
  storage: {},
  db: {},
  auth: {},
  rtdb: {},
  functions: {},
}));


const type = (el: HTMLElement, text: string) => userEvent.type(el, text);

beforeEach(() => localStorage.clear());

describe('NoteComposer — escrita', () => {
  it('só habilita salvar quando há texto', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /registrar nota/i });
    expect(btn).toBeDisabled();

    await type(screen.getByLabelText('Corpo da nota'), 'cliente pediu proposta');
    expect(btn).toBeEnabled();
  });

  it('envia o texto sem espaços nas pontas e limpa o campo', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NoteComposer onSubmit={onSubmit} />);

    const ta = screen.getByLabelText('Corpo da nota');
    await type(ta, '  nota nova  ');
    await userEvent.click(screen.getByRole('button', { name: /registrar nota/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('nota nova', [], expect.any(String)));
    await waitFor(() => expect(ta).toHaveValue(''));
  });

  it('mostra erro e preserva o texto quando o salvamento falha', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<NoteComposer onSubmit={onSubmit} />);

    await type(screen.getByLabelText('Corpo da nota'), 'não perder isso');
    await userEvent.click(screen.getByRole('button', { name: /registrar nota/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível salvar/i);
    expect(screen.getByLabelText('Corpo da nota')).toHaveValue('não perder isso');
  });
});

describe('NoteComposer — toolbar e atalhos', () => {
  it('negrito envolve a seleção', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText('Corpo da nota') as HTMLTextAreaElement;

    await type(ta, 'urgente');
    ta.setSelectionRange(0, 7);
    await userEvent.click(screen.getByRole('button', { name: /negrito/i }));

    expect(ta).toHaveValue('**urgente**');
  });

  it('checklist prefixa a linha', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, 'ligar amanhã');
    await userEvent.click(screen.getByRole('button', { name: /checklist/i }));

    expect(ta).toHaveValue('- [ ] ligar amanhã');
  });

  it('Ctrl+Enter salva', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NoteComposer onSubmit={onSubmit} />);

    await type(screen.getByLabelText('Corpo da nota'), 'rápido');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('rápido', [], expect.any(String)));
  });

  it('colar URL sobre texto selecionado cria link markdown', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText('Corpo da nota') as HTMLTextAreaElement;

    await type(ta, 'proposta');
    ta.setSelectionRange(0, 8);
    await userEvent.paste('https://wizmart.com.br/p/1');

    expect(ta).toHaveValue('[proposta](https://wizmart.com.br/p/1)');
  });
});

describe('NoteComposer — menções', () => {
  const sellers = [
    { id: 'sdr-001', name: 'João SDR', initials: 'JS', color: '#B45309' },
    { id: 'rep-001', name: 'Carla Rep', initials: 'CR', color: '#B91C1C' },
    { id: 'bdr-001', name: 'Lucas BDR', initials: 'LB', color: '#7C3AED' },
  ];

  const comMencoes = (props: Record<string, unknown> = {}) =>
    render(<NoteComposer onSubmit={vi.fn()} sellers={sellers} currentUid="sdr-001" {...props} />);

  it('abre a lista ao digitar @ e filtra enquanto digita', async () => {
    comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, 'avisar @');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // o próprio autor não aparece
    expect(screen.queryByText('João SDR')).not.toBeInTheDocument();

    await type(ta, 'car');
    expect(screen.getByText('Carla Rep')).toBeInTheDocument();
    expect(screen.queryByText('Lucas BDR')).not.toBeInTheDocument();
  });

  it('não abre no meio de um e-mail', async () => {
    comMencoes();
    await type(screen.getByLabelText('Corpo da nota'), 'contato@empresa');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('escolher pelo clique insere a menção com o uid', async () => {
    comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, 'avisar @car');
    await userEvent.click(screen.getByRole('option', { name: /carla rep/i }));

    expect(ta).toHaveValue('avisar [@Carla Rep](wm:user/rep-001) ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navega com as setas e confirma com Enter', async () => {
    comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, '@');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // segunda opção da lista (a primeira é Carla, o autor é excluído)
    expect(ta).toHaveValue('[@Lucas BDR](wm:user/bdr-001) ');
  });

  it('Esc fecha a lista sem inserir nada', async () => {
    comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, 'oi @car');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(ta).toHaveValue('oi @car');
  });

  it('Enter com a lista aberta não salva a nota', async () => {
    const onSubmit = vi.fn();
    comMencoes({ onSubmit });

    await type(screen.getByLabelText('Corpo da nota'), 'oi @car');
    await userEvent.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('não sugere de novo quem já foi mencionado', async () => {
    comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, '@car');
    await userEvent.click(screen.getByRole('option', { name: /carla rep/i }));
    await type(ta, 'e @');

    expect(screen.queryByText('Carla Rep')).not.toBeInTheDocument();
    expect(screen.getByText('Lucas BDR')).toBeInTheDocument();
  });

  it('renderiza a menção como chip na prévia, nunca como link', async () => {
    const { container } = comMencoes();
    const ta = screen.getByLabelText('Corpo da nota');

    await type(ta, '@car');
    await userEvent.click(screen.getByRole('option', { name: /carla rep/i }));
    await userEvent.click(screen.getByRole('tab', { name: 'Visualizar' }));

    expect(container.querySelector('.md-mention')).toHaveTextContent('@Carla Rep');
    // o esquema wm: não pode virar href no DOM
    expect(container.querySelector('a[href^="wm:"]')).toBeNull();
  });

  it('sem lista de pessoas, o @ é texto comum', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    await type(screen.getByLabelText('Corpo da nota'), 'preço @ vista');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('NoteComposer — prévia', () => {
  it('renderiza o markdown na aba Visualizar', async () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    await type(screen.getByLabelText('Corpo da nota'), '**fechado**');
    await userEvent.click(screen.getByRole('tab', { name: 'Visualizar' }));

    expect(screen.getByText('fechado').tagName).toBe('STRONG');
    expect(screen.queryByLabelText('Corpo da nota')).not.toBeInTheDocument();
  });

  it('prévia fica desabilitada sem conteúdo', () => {
    render(<NoteComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Visualizar' })).toBeDisabled();
  });
});

describe('NoteComposer — rascunho', () => {
  it('restaura o rascunho do card ao reabrir', async () => {
    const { unmount } = render(<NoteComposer draftKey="deal-001" onSubmit={vi.fn()} />);
    await type(screen.getByLabelText('Corpo da nota'), 'meio escrito');
    unmount();

    render(<NoteComposer draftKey="deal-001" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Corpo da nota')).toHaveValue('meio escrito');
  });

  it('não mistura rascunho entre cards diferentes', async () => {
    const { unmount } = render(<NoteComposer draftKey="deal-001" onSubmit={vi.fn()} />);
    await type(screen.getByLabelText('Corpo da nota'), 'do card 1');
    unmount();

    render(<NoteComposer draftKey="deal-002" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Corpo da nota')).toHaveValue('');
  });

  it('descarta o rascunho depois de salvar', async () => {
    render(<NoteComposer draftKey="deal-001" onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    await type(screen.getByLabelText('Corpo da nota'), 'vai salvar');
    await userEvent.click(screen.getByRole('button', { name: /registrar nota/i }));

    await waitFor(() => expect(localStorage.getItem('wm_note_draft_deal-001')).toBeNull());
  });

  it('edição não salva rascunho', async () => {
    render(
      <NoteComposer mode="edit" initialBody="original" submitLabel="Salvar alterações" onSubmit={vi.fn()} />
    );
    await type(screen.getByLabelText('Corpo da nota'), ' editado');
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
});

describe('NoteComposer — edição', () => {
  it('abre com o corpo atual e permite cancelar', async () => {
    const onCancel = vi.fn();
    render(
      <NoteComposer
        mode="edit"
        initialBody="texto anterior"
        submitLabel="Salvar alterações"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText('Corpo da nota')).toHaveValue('texto anterior');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
