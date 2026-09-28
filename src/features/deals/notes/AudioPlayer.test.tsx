import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioPlayer } from './AudioPlayer';
import type { NoteAttachment } from '../../../types/crm';

const audio = (over: Partial<NoteAttachment> = {}): NoteAttachment => ({
  id: 'au1',
  kind: 'audio',
  name: 'recado.m4a',
  mime: 'audio/mp4',
  size: 240_000,
  storagePath: 'tenants/wizmart/notes/n1/au1/recado.m4a',
  url: 'https://storage.example/recado.m4a',
  durationMs: 67_000,
  source: 'mic',
  uploadedBy: 'sdr-001',
  ...over,
});

describe('AudioPlayer', () => {
  it('mostra a duração medida no upload antes de carregar o arquivo', () => {
    render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.getByText('0:00 / 1:07')).toBeInTheDocument();
  });

  it('aponta para o arquivo com preload de metadados', () => {
    const { container } = render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    const el = container.querySelector('audio');
    expect(el).toHaveAttribute('src', 'https://storage.example/recado.m4a');
    expect(el).toHaveAttribute('preload', 'metadata');
  });

  it('alterna a velocidade em 1x → 1.5x → 2x → 1x', async () => {
    render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Velocidade de reprodução' });

    expect(btn).toHaveTextContent('1x');
    await userEvent.click(btn);
    expect(btn).toHaveTextContent('1.5x');
    await userEvent.click(btn);
    expect(btn).toHaveTextContent('2x');
    await userEvent.click(btn);
    expect(btn).toHaveTextContent('1x');
  });

  it('acompanha o tempo enquanto toca', () => {
    const { container } = render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    const el = container.querySelector('audio') as HTMLAudioElement;

    Object.defineProperty(el, 'currentTime', { value: 12, configurable: true });
    fireEvent.timeUpdate(el);

    expect(screen.getByText('0:12 / 1:07')).toBeInTheDocument();
  });

  it('ignora duração infinita — comum em gravação de MediaRecorder', () => {
    const { container } = render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    const el = container.querySelector('audio') as HTMLAudioElement;

    Object.defineProperty(el, 'duration', { value: Infinity, configurable: true });
    fireEvent.loadedMetadata(el);

    // mantém a duração medida no upload em vez de mostrar lixo
    expect(screen.getByText('0:00 / 1:07')).toBeInTheDocument();
  });

  it('adota a duração real quando o arquivo informa', () => {
    const { container } = render(
      <AudioPlayer attachment={audio({ durationMs: 0 })} canDelete={false} onDelete={vi.fn()} />
    );
    const el = container.querySelector('audio') as HTMLAudioElement;

    Object.defineProperty(el, 'duration', { value: 30, configurable: true });
    fireEvent.loadedMetadata(el);

    expect(screen.getByText('0:00 / 0:30')).toBeInTheDocument();
  });

  it('autor exclui com confirmação', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<AudioPlayer attachment={audio()} canDelete onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /excluir recado/i }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('quem não é autor não vê a lixeira', () => {
    render(<AudioPlayer attachment={audio()} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });
});
