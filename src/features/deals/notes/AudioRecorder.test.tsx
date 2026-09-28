import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioRecorder } from './AudioRecorder';

/**
 * MediaRecorder de mentira: guarda o estado, entrega um chunk quando pedimos e
 * dispara `onstop` como o de verdade. Nem happy-dom nem jsdom implementam a
 * API, e é justamente o comportamento dela que queremos exercitar.
 */
class FakeMediaRecorder {
  static supported: string[] = ['audio/webm;codecs=opus', 'audio/webm'];
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported = (mime: string) => FakeMediaRecorder.supported.includes(mime);

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.last = this;
  }

  start() {
    this.state = 'recording';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const fakeTrack = { stop: vi.fn() };
const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMedia = vi.fn().mockResolvedValue(fakeStream);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia },
  });
  // O medidor de nível é enfeite; sem AudioContext ele apenas não desenha
  vi.stubGlobal('AudioContext', undefined);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  FakeMediaRecorder.supported = ['audio/webm;codecs=opus', 'audio/webm'];
  fakeTrack.stop.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const startRecording = async () => {
  await userEvent.click(screen.getByRole('button', { name: /gravar/i }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
};

describe('AudioRecorder — fluxo de gravação', () => {
  it('grava, conclui e entrega o arquivo ao anexar', async () => {
    const onReady = vi.fn();
    const onClose = vi.fn();
    render(<AudioRecorder onReady={onReady} onClose={onClose} />);

    await startRecording();
    expect(screen.getByText(/de 5:00/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /concluir/i }));
    await screen.findByRole('button', { name: /anexar áudio/i });

    await userEvent.click(screen.getByRole('button', { name: /anexar áudio/i }));

    expect(onReady).toHaveBeenCalledTimes(1);
    const file = onReady.mock.calls[0][0] as File;
    expect(file.type).toBe('audio/webm');
    expect(file.name).toMatch(/^Gravacao .+\.webm$/);
    expect(onClose).toHaveBeenCalled();
  });

  it('grava em MP4 no Safari, que não suporta WebM', async () => {
    FakeMediaRecorder.supported = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];
    const onReady = vi.fn();
    render(<AudioRecorder onReady={onReady} onClose={vi.fn()} />);

    await startRecording();
    await userEvent.click(screen.getByRole('button', { name: /concluir/i }));
    await userEvent.click(await screen.findByRole('button', { name: /anexar áudio/i }));

    const file = onReady.mock.calls[0][0] as File;
    expect(file.type).toBe('audio/mp4');
    expect(file.name).toMatch(/\.m4a$/);
  });

  it('pausa e continua', async () => {
    render(<AudioRecorder onReady={vi.fn()} onClose={vi.fn()} />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: /pausar/i }));
    expect(FakeMediaRecorder.last?.state).toBe('paused');
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(FakeMediaRecorder.last?.state).toBe('recording');
  });

  it('regravar descarta a gravação anterior', async () => {
    const onReady = vi.fn();
    render(<AudioRecorder onReady={onReady} onClose={vi.fn()} />);

    await startRecording();
    await userEvent.click(screen.getByRole('button', { name: /concluir/i }));
    await userEvent.click(await screen.findByRole('button', { name: /regravar/i }));

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByText(/toque no microfone para gravar/i)).toBeInTheDocument();
  });

  it('encerra o microfone ao concluir — senão o indicador do sistema fica aceso', async () => {
    render(<AudioRecorder onReady={vi.fn()} onClose={vi.fn()} />);
    await startRecording();
    await userEvent.click(screen.getByRole('button', { name: /concluir/i }));

    await waitFor(() => expect(fakeTrack.stop).toHaveBeenCalled());
  });
});

describe('AudioRecorder — interrupções', () => {
  it('salva o que já gravou quando o app vai para segundo plano (iOS)', async () => {
    const onReady = vi.fn();
    render(<AudioRecorder onReady={onReady} onClose={vi.fn()} />);
    await startRecording();

    // iOS corta a captura ao sair de foco
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => { fireEvent(document, new Event('visibilitychange')); });

    // a gravação foi encerrada e está pronta para revisão, não perdida
    expect(await screen.findByRole('button', { name: /anexar áudio/i })).toBeInTheDocument();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
});

describe('AudioRecorder — permissões', () => {
  it('explica a permissão negada em vez de mostrar erro genérico', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AudioRecorder onReady={vi.fn()} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /gravar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/permissão de microfone negada/i);
  });

  it('avisa quando não há microfone', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('none'), { name: 'NotFoundError' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AudioRecorder onReady={vi.fn()} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /gravar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/nenhum microfone/i);
  });

  it('orienta a anexar arquivo quando o navegador não grava', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    render(<AudioRecorder onReady={vi.fn()} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /gravar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não permite gravar áudio/i);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
