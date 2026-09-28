import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkdownView } from './MarkdownView';

describe('MarkdownView — sanitização de ponta a ponta', () => {
  it('não injeta script vindo do corpo da nota', () => {
    const { container } = render(
      <MarkdownView body={'Oi\n\n<script>window.__hacked = true</script>'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__hacked).toBeUndefined();
  });

  it('não renderiza iframe', () => {
    const { container } = render(<MarkdownView body={'<iframe src="https://evil.com"></iframe>'} />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('degrada link javascript: para texto simples', () => {
    const { container } = render(<MarkdownView body={'[clique](javascript:alert(1))'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('clique')).toBeInTheDocument();
  });

  it('não renderiza imagem por URL externa', () => {
    const { container } = render(<MarkdownView body={'![tracker](https://evil.com/pixel.gif)'} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('abre link seguro em nova aba sem vazar opener', () => {
    render(<MarkdownView body={'[site](https://wizmart.com.br)'} />);
    const a = screen.getByRole('link', { name: 'site' });
    expect(a).toHaveAttribute('href', 'https://wizmart.com.br');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('MarkdownView — menções', () => {
  const body = 'Falei com [@Carla Rep](wm:user/rep-001) hoje.';

  it('renderiza a menção como chip, nunca como âncora', () => {
    const { container } = render(<MarkdownView body={body} />);

    const chip = container.querySelector('.md-mention');
    expect(chip).toHaveTextContent('@Carla Rep');
    expect(chip?.tagName).toBe('SPAN');
    expect(container.querySelector('a[href^="wm:"]')).toBeNull();
  });

  it('chip é clicável e devolve o uid quando há handler', async () => {
    const onMentionClick = vi.fn();
    render(<MarkdownView body={body} onMentionClick={onMentionClick} />);

    await userEvent.click(screen.getByRole('button', { name: '@Carla Rep' }));
    expect(onMentionClick).toHaveBeenCalledWith('rep-001');
  });

  it('chip responde ao teclado', async () => {
    const onMentionClick = vi.fn();
    render(<MarkdownView body={body} onMentionClick={onMentionClick} />);

    screen.getByRole('button', { name: '@Carla Rep' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onMentionClick).toHaveBeenCalledWith('rep-001');
  });

  it('sem handler, o chip não é interativo', () => {
    render(<MarkdownView body={body} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('esquema parecido com menção mas inválido não vira chip nem link', () => {
    const { container } = render(<MarkdownView body={'[x](wm:evil/payload)'} />);
    expect(container.querySelector('.md-mention')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('links comuns seguem funcionando ao lado das menções', () => {
    render(<MarkdownView body={'[@Carla](wm:user/rep-001) veja [proposta](https://x.com)'} />);
    expect(screen.getByRole('link', { name: 'proposta' })).toHaveAttribute('href', 'https://x.com');
  });
});

describe('MarkdownView — marcação', () => {
  it('renderiza ênfase, lista e tabela do GFM', () => {
    const { container } = render(
      <MarkdownView body={'**forte**\n\n- um\n- dois\n\n| a | b |\n| - | - |\n| 1 | 2 |'} />
    );
    expect(container.querySelector('strong')).toHaveTextContent('forte');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('table')).toBeInTheDocument();
  });
});

describe('MarkdownView — checklist', () => {
  const body = '- [ ] ligar para o cliente\n- [x] enviar proposta\n- [ ] agendar visita';

  it('checkboxes ficam desabilitadas sem handler', () => {
    render(<MarkdownView body={body} />);
    screen.getAllByRole('checkbox').forEach(cb => expect(cb).toBeDisabled());
  });

  it('devolve o índice correto do item clicado', async () => {
    const onToggle = vi.fn();
    render(<MarkdownView body={body} onToggleChecklist={onToggle} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);

    await userEvent.click(boxes[2]);
    expect(onToggle).toHaveBeenCalledWith(2);

    await userEvent.click(boxes[0]);
    expect(onToggle).toHaveBeenLastCalledWith(0);
  });

  it('reflete o estado marcado do corpo', () => {
    render(<MarkdownView body={body} onToggleChecklist={vi.fn()} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });
});
