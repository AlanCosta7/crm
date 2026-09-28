import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaGrid } from './MediaGrid';
import type { NoteAttachment } from '../../../types/crm';

const media = (over: Partial<NoteAttachment> = {}): NoteAttachment => ({
  id: 'a1',
  kind: 'image',
  name: 'fachada.webp',
  mime: 'image/webp',
  size: 320_000,
  storagePath: 'tenants/wizmart/notes/n1/a1/fachada.webp',
  url: 'https://storage.example/fachada.webp',
  thumbUrl: 'https://storage.example/thumb.webp',
  width: 1500,
  height: 2000,
  source: 'upload',
  uploadedBy: 'sdr-001',
  ...over,
});

const video = media({
  id: 'v1',
  kind: 'video',
  name: 'visita.mp4',
  mime: 'video/mp4',
  url: 'https://storage.example/visita.mp4',
  durationMs: 67_000,
});

describe('MediaGrid — mosaico', () => {
  it('não renderiza nada sem itens', () => {
    const { container } = render(<MediaGrid items={[]} canDelete onDelete={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('carrega a miniatura, não o arquivo cheio', () => {
    render(<MediaGrid items={[media()]} canDelete={false} onDelete={vi.fn()} />);
    const img = screen.getByRole('img', { name: 'fachada.webp' });
    expect(img).toHaveAttribute('src', 'https://storage.example/thumb.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('usa a proporção original para não pular o layout', () => {
    render(<MediaGrid items={[media()]} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /abrir fachada/i })).toHaveStyle({
      aspectRatio: '1500 / 2000',
    });
  });

  it('mostra duração do vídeo', () => {
    render(<MediaGrid items={[video]} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.getByText('1:07')).toBeInTheDocument();
  });
});

describe('MediaGrid — visualizador', () => {
  it('abre no item clicado e fecha no botão', async () => {
    render(<MediaGrid items={[media(), media({ id: 'a2', name: 'interior.webp' })]} canDelete={false} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /abrir interior/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('interior.webp');
    expect(screen.getByText('2 de 2 · 313 KB')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navega com as setas do teclado e fecha com Esc', async () => {
    render(<MediaGrid items={[media(), media({ id: 'a2', name: 'interior.webp' })]} canDelete={false} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /abrir fachada/i }));

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('interior.webp');

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('fachada.webp');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não passa dos limites da lista', async () => {
    render(<MediaGrid items={[media()]} canDelete={false} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /abrir fachada/i }));

    // item único: sem botões de navegação
    expect(screen.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('fachada.webp');
  });

  it('vídeo abre no player nativo com o poster', async () => {
    const { container } = render(<MediaGrid items={[video]} canDelete={false} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /abrir visita/i }));

    const player = container.querySelector('video');
    expect(player).toHaveAttribute('src', 'https://storage.example/visita.mp4');
    expect(player).toHaveAttribute('poster', 'https://storage.example/thumb.webp');
    expect(player).toHaveAttribute('controls');
  });

  it('trava o scroll do fundo enquanto está aberto', async () => {
    render(<MediaGrid items={[media()]} canDelete={false} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /abrir fachada/i }));
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });
});

describe('MediaGrid — exclusão', () => {
  it('autor exclui com confirmação', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<MediaGrid items={[media()]} canDelete onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /excluir fachada/i }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' })));
  });

  it('quem não é autor não vê a lixeira', () => {
    render(<MediaGrid items={[media()]} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });
});
