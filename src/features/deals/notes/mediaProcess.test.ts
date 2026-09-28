import { describe, it, expect } from 'vitest';
import {
  computeTargetSize,
  shouldReplaceOriginal,
  renameToWebp,
  formatDuration,
  MAX_IMAGE_EDGE,
  THUMB_EDGE,
} from './mediaProcess';

describe('computeTargetSize', () => {
  it('reduz pelo maior lado preservando a proporção', () => {
    // foto de celular em pé, 3024x4032
    expect(computeTargetSize({ width: 3024, height: 4032 }, MAX_IMAGE_EDGE)).toEqual({
      width: 1500,
      height: 2000,
    });
  });

  it('funciona igual na horizontal', () => {
    expect(computeTargetSize({ width: 4000, height: 2000 }, MAX_IMAGE_EDGE)).toEqual({
      width: 2000,
      height: 1000,
    });
  });

  it('não amplia imagem menor que o limite', () => {
    expect(computeTargetSize({ width: 800, height: 600 }, MAX_IMAGE_EDGE)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('gera miniatura no limite menor', () => {
    expect(computeTargetSize({ width: 3024, height: 4032 }, THUMB_EDGE)).toEqual({
      width: 300,
      height: 400,
    });
  });

  it('nunca devolve dimensão zero para imagem muito alongada', () => {
    const r = computeTargetSize({ width: 5000, height: 3 }, THUMB_EDGE);
    expect(r.width).toBe(400);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it('trata dimensões inválidas', () => {
    expect(computeTargetSize({ width: 0, height: 0 }, THUMB_EDGE)).toEqual({ width: 0, height: 0 });
  });
});

describe('shouldReplaceOriginal', () => {
  it('troca quando o reencodado é bem menor', () => {
    expect(shouldReplaceOriginal(4_000_000, 400_000, 'image/jpeg')).toBe(true);
  });

  it('mantém o original quando o ganho é irrelevante', () => {
    expect(shouldReplaceOriginal(100_000, 99_000, 'image/png')).toBe(false);
  });

  it('mantém o original quando o reencodado ficou maior', () => {
    expect(shouldReplaceOriginal(50_000, 80_000, 'image/png')).toBe(false);
  });

  it('sempre troca HEIC — o formato não abre no Chrome', () => {
    expect(shouldReplaceOriginal(1_000_000, 1_500_000, 'image/heic')).toBe(true);
    expect(shouldReplaceOriginal(1_000_000, 1_500_000, 'image/heif')).toBe(true);
  });
});

describe('renameToWebp', () => {
  it('troca a extensão', () => {
    expect(renameToWebp('foto.HEIC')).toBe('foto.webp');
    expect(renameToWebp('print da tela.png')).toBe('print da tela.webp');
  });

  it('aceita nome sem extensão', () => {
    expect(renameToWebp('imagem')).toBe('imagem.webp');
  });

  it('aplica sufixo quando pedido', () => {
    expect(renameToWebp('foto.jpg', '-thumb')).toBe('foto-thumb.webp');
  });
});

describe('formatDuration', () => {
  it('formata segundos e minutos', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7_000)).toBe('0:07');
    expect(formatDuration(67_000)).toBe('1:07');
    expect(formatDuration(723_000)).toBe('12:03');
  });

  it('inclui horas quando passa de 60 min', () => {
    expect(formatDuration(3_765_000)).toBe('1:02:45');
  });

  it('trata ausente e negativo', () => {
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
