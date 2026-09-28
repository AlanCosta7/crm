/**
 * Regras da gravação de áudio no navegador.
 *
 * O ponto sensível é o formato: cada navegador grava no seu. Chrome e Android
 * produzem WebM/Opus; Safari (iOS e macOS) só produz MP4/AAC e devolve `false`
 * para qualquer `audio/webm`. Por isso negociamos o container na hora de
 * gravar e guardamos o MIME real no anexo — o `<audio>` de quem for ouvir
 * precisa dessa informação para escolher o decodificador certo.
 *
 * Este arquivo é só a decisão (pura e testável); a captura em si está em
 * `AudioRecorder.tsx`.
 */

/** Preferência de container, do melhor para o aceitável. */
export const MIME_CANDIDATES = [
  'audio/webm;codecs=opus', // Chrome, Edge, Android
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2', // Safari iOS/macOS
  'audio/mp4',
  'audio/ogg;codecs=opus', // Firefox antigo
] as const;

/** Teto por gravação. Acima disso o arquivo fica grande e ninguém escuta. */
export const MAX_RECORDING_MS = 5 * 60 * 1000;

/** A partir daqui o contador vira aviso de que o limite está perto. */
export const WARN_RECORDING_MS = MAX_RECORDING_MS - 30 * 1000;

type SupportCheck = (mime: string) => boolean;

/**
 * Escolhe o melhor container que o navegador aceita. Devolve `''` quando
 * nenhum candidato passa — o MediaRecorder então usa o padrão dele, que é
 * exatamente o que queremos como último recurso.
 */
export function pickMimeType(isSupported?: SupportCheck): string {
  const check =
    isSupported ??
    (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? (m: string) => MediaRecorder.isTypeSupported(m)
      : null);

  if (!check) return '';
  return MIME_CANDIDATES.find(m => check(m)) ?? '';
}

/** Extensão coerente com o container gravado. */
export function extensionForMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg')) return 'mp3';
  return 'webm';
}

/**
 * Normaliza o MIME do blob para um que a allowlist do Storage reconheça.
 * O MediaRecorder devolve coisas como `audio/webm;codecs=opus`, e as rules
 * comparam o tipo puro.
 */
export function normalizeAudioMime(mime: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  return base || 'audio/webm';
}

/** Nome do arquivo da gravação, com data e hora locais. */
export function recordingFileName(date: Date, mime: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `Gravacao ${stamp}.${extensionForMime(mime)}`;
}

/** `true` quando o navegador tem o necessário para gravar. */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Mensagem para o usuário a partir do erro do `getUserMedia`. Distinguir
 * "negou a permissão" de "não tem microfone" importa: a saída é diferente.
 */
export function describeRecordingError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão de microfone negada. Libere o acesso nas configurações do navegador e tente de novo.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhum microfone encontrado neste aparelho.';
  }
  if (name === 'NotReadableError') {
    return 'O microfone está sendo usado por outro aplicativo.';
  }
  return 'Não foi possível iniciar a gravação.';
}

/**
 * Detecta aparelho com tela sensível ao toque — é o critério para oferecer os
 * botões de câmera (que abrem o app de câmera nativo via `capture`). No
 * desktop eles só abririam o seletor de arquivos, que o botão "Anexar" já faz.
 */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
