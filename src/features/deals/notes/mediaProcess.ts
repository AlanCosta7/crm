/**
 * Preparo de mídia no navegador, antes do upload.
 *
 * Por que fazer no client:
 *  - foto de celular hoje tem 4–12 MB; reencodada em WebP a 2000px cai para
 *    algumas centenas de KB, o que muda a experiência de quem anexa no 4G e
 *    corta custo de Storage e de banda
 *  - a miniatura sai de graça no mesmo passo, evitando uma Cloud Function de
 *    thumbnails (mais custo, mais latência, mais uma peça para manter)
 *  - HEIC do iPhone é decodificado pelo Safari e reencodado em WebP, então a
 *    foto passa a abrir no Chrome e no Android também
 *
 * Tudo aqui é best-effort: se o navegador não decodificar o arquivo (HEIC no
 * Chrome, codec de vídeo exótico), as funções devolvem `null` e o upload segue
 * com o arquivo original. Nunca bloqueiam o anexo.
 */

/** Maior lado da imagem depois do redimensionamento. */
export const MAX_IMAGE_EDGE = 2000;
/** Maior lado da miniatura. */
export const THUMB_EDGE = 400;

const IMAGE_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

export interface Dimensions {
  width: number;
  height: number;
}

export interface ProcessedImage {
  /** Arquivo a subir — o reencodado, ou o original quando não valeu a pena */
  file: File;
  dimensions: Dimensions;
  /** Miniatura em WebP; `null` se o navegador não conseguiu gerar */
  thumb: File | null;
}

/**
 * Calcula o tamanho de destino preservando a proporção. Imagem menor que o
 * limite não é ampliada — devolve as dimensões originais.
 */
export function computeTargetSize(source: Dimensions, maxEdge: number): Dimensions {
  const { width, height } = source;
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decide se vale trocar o original pelo reencodado. Reencodar uma imagem que
 * já estava pequena costuma aumentar o arquivo — nesse caso o original vence.
 * HEIC é exceção: sempre trocamos, porque o formato não abre no Chrome.
 */
export function shouldReplaceOriginal(
  originalSize: number,
  processedSize: number,
  originalMime: string
): boolean {
  if (/heic|heif/i.test(originalMime)) return true;
  return processedSize < originalSize * 0.95;
}

/** Troca a extensão do nome pela do formato reencodado. */
export function renameToWebp(name: string, suffix = ''): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '') || 'imagem';
  return `${base}${suffix}.webp`;
}

/** `true` quando o ambiente tem o necessário para processar mídia. */
export function canProcessMedia(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.toBlob === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar a imagem.'));
    img.src = src;
  });
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  name: string,
  quality: number
): Promise<File | null> {
  return new Promise(resolve => {
    canvas.toBlob(
      blob => resolve(blob ? new File([blob], name, { type: 'image/webp' }) : null),
      'image/webp',
      quality
    );
  });
}

function drawScaled(source: CanvasImageSource, target: Dimensions): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return canvas;
}

/**
 * Redimensiona, reencoda em WebP e gera a miniatura. Devolve `null` se o
 * navegador não conseguiu decodificar o arquivo — o chamador sobe o original.
 */
export async function processImage(file: File): Promise<ProcessedImage | null> {
  if (!canProcessMedia()) return null;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const source: Dimensions = { width: img.naturalWidth, height: img.naturalHeight };
    if (!source.width || !source.height) return null;

    const full = computeTargetSize(source, MAX_IMAGE_EDGE);
    const fullCanvas = drawScaled(img, full);
    const processed = fullCanvas ? await canvasToFile(fullCanvas, renameToWebp(file.name), IMAGE_QUALITY) : null;

    const thumbSize = computeTargetSize(source, THUMB_EDGE);
    const thumbCanvas = drawScaled(img, thumbSize);
    const thumb = thumbCanvas ? await canvasToFile(thumbCanvas, 'thumb.webp', THUMB_QUALITY) : null;

    const useProcessed =
      processed && shouldReplaceOriginal(file.size, processed.size, file.type);

    return {
      file: useProcessed ? processed : file,
      dimensions: useProcessed ? full : source,
      thumb,
    };
  } catch {
    return null; // HEIC no Chrome, arquivo corrompido, etc.
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ProbedVideo {
  dimensions: Dimensions;
  durationMs: number;
  /** Quadro capturado por volta de 1s, em WebP — serve de capa na timeline */
  poster: File | null;
}

/**
 * Lê dimensões e duração do vídeo e captura um quadro para usar de capa.
 * Não há transcodificação: comprimir vídeo no navegador é caro e lento demais
 * para valer a pena aqui.
 */
export async function probeVideo(file: File): Promise<ProbedVideo | null> {
  if (!canProcessMedia()) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    const meta = await new Promise<ProbedVideo | null>(resolve => {
      const fail = () => resolve(null);
      video.onerror = fail;

      video.onloadedmetadata = () => {
        const dimensions = { width: video.videoWidth, height: video.videoHeight };
        const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;

        // Buscar o quadro: 1s costuma evitar o preto do início
        const seekTo = Math.min(1, Math.max(0, video.duration - 0.1));
        video.onseeked = async () => {
          const target = computeTargetSize(dimensions, THUMB_EDGE);
          const canvas = target.width ? drawScaled(video, target) : null;
          const poster = canvas ? await canvasToFile(canvas, 'thumb.webp', THUMB_QUALITY) : null;
          resolve({ dimensions, durationMs, poster });
        };
        video.currentTime = seekTo;
      };

      video.src = url;
    });

    return meta;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Duração de um arquivo de áudio, em ms. `0` quando não dá para saber. */
export async function probeAudioDuration(file: File): Promise<number> {
  if (typeof Audio === 'undefined' || typeof URL?.createObjectURL !== 'function') return 0;

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>(resolve => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () =>
        resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
      audio.onerror = () => resolve(0);
      audio.src = url;
    });
  } catch {
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Duração legível: `1:07`, `12:03`, `1:02:45`. */
export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
