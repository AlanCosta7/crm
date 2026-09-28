import { describe, it, expect } from 'vitest';
import {
  pickMimeType,
  extensionForMime,
  normalizeAudioMime,
  recordingFileName,
  describeRecordingError,
  MIME_CANDIDATES,
  MAX_RECORDING_MS,
  WARN_RECORDING_MS,
} from './audioRecording';

/** Simula o suporte de um navegador a partir de uma lista de MIMEs. */
const supports = (aceitos: string[]) => (mime: string) => aceitos.includes(mime);

describe('pickMimeType', () => {
  it('Chrome/Android: prefere WebM com Opus', () => {
    expect(pickMimeType(supports(['audio/webm;codecs=opus', 'audio/webm']))).toBe('audio/webm;codecs=opus');
  });

  it('Safari: cai em MP4, que é o único que ele grava', () => {
    const safari = supports(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4']);
    expect(pickMimeType(safari)).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('Firefox antigo: aceita Ogg/Opus', () => {
    expect(pickMimeType(supports(['audio/ogg;codecs=opus']))).toBe('audio/ogg;codecs=opus');
  });

  it('devolve string vazia quando nada é suportado — MediaRecorder usa o padrão dele', () => {
    expect(pickMimeType(supports([]))).toBe('');
  });

  it('respeita a ordem de preferência quando há mais de um suportado', () => {
    const tudo = supports([...MIME_CANDIDATES]);
    expect(pickMimeType(tudo)).toBe(MIME_CANDIDATES[0]);
  });
});

describe('extensionForMime', () => {
  it('mapeia os containers usados na prática', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMime('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionForMime('audio/wav')).toBe('wav');
  });

  it('usa webm como padrão para tipo desconhecido ou vazio', () => {
    expect(extensionForMime('')).toBe('webm');
    expect(extensionForMime('audio/estranho')).toBe('webm');
  });
});

describe('normalizeAudioMime', () => {
  it('descarta os parâmetros de codec — as rules comparam o tipo puro', () => {
    expect(normalizeAudioMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeAudioMime('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
  });

  it('não quebra com entrada vazia', () => {
    expect(normalizeAudioMime('')).toBe('audio/webm');
  });
});

describe('recordingFileName', () => {
  it('usa data e hora locais com a extensão do container', () => {
    const d = new Date(2026, 7, 31, 9, 5); // 31/08/2026 09:05 local
    expect(recordingFileName(d, 'audio/mp4')).toBe('Gravacao 2026-08-31 0905.m4a');
    expect(recordingFileName(d, 'audio/webm;codecs=opus')).toBe('Gravacao 2026-08-31 0905.webm');
  });
});

describe('describeRecordingError', () => {
  it('separa permissão negada de microfone ausente', () => {
    expect(describeRecordingError({ name: 'NotAllowedError' })).toContain('Permissão de microfone negada');
    expect(describeRecordingError({ name: 'NotFoundError' })).toContain('Nenhum microfone');
  });

  it('avisa quando outro app está usando o microfone', () => {
    expect(describeRecordingError({ name: 'NotReadableError' })).toContain('outro aplicativo');
  });

  it('tem mensagem genérica para o resto', () => {
    expect(describeRecordingError(new Error('boom'))).toBe('Não foi possível iniciar a gravação.');
    expect(describeRecordingError(undefined)).toBe('Não foi possível iniciar a gravação.');
  });
});

describe('limites de gravação', () => {
  it('para em 5 minutos e avisa 30 s antes', () => {
    expect(MAX_RECORDING_MS).toBe(300_000);
    expect(WARN_RECORDING_MS).toBe(270_000);
  });
});
