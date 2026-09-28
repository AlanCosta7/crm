import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardInset } from './useKeyboardInset';

/** visualViewport de mentira, com controle da altura e dos ouvintes. */
function fakeViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    height,
    offsetTop,
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    emit(type: string) {
      listeners.get(type)?.forEach(fn => fn());
    },
    listenerCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

const kb = () => document.documentElement.style.getPropertyValue('--kb');

let viewport: ReturnType<typeof fakeViewport>;

beforeEach(() => {
  vi.stubGlobal('innerHeight', 800);
  viewport = fakeViewport(800);
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--kb');
});

describe('useKeyboardInset', () => {
  it('não mexe em nada quando está inativo', () => {
    viewport.height = 450; // teclado aberto, mas o composer não está em foco
    renderHook(() => useKeyboardInset(false));
    expect(kb()).toBe('');
  });

  it('publica a altura do teclado enquanto ativo', () => {
    viewport.height = 450; // 800 - 450 = 350px de teclado
    renderHook(() => useKeyboardInset(true));
    expect(kb()).toBe('350px');
  });

  it('trata como zero o que for pequeno demais para ser teclado', () => {
    viewport.height = 760; // 40px: barra do navegador, não teclado
    renderHook(() => useKeyboardInset(true));
    expect(kb()).toBe('0px');
  });

  it('acompanha o teclado abrindo e fechando', () => {
    renderHook(() => useKeyboardInset(true));
    expect(kb()).toBe('0px');

    viewport.height = 400;
    viewport.emit('resize');
    expect(kb()).toBe('400px');

    viewport.height = 800;
    viewport.emit('resize');
    expect(kb()).toBe('0px');
  });

  it('considera o deslocamento do viewport (zoom no iOS)', () => {
    viewport.height = 500;
    viewport.offsetTop = 60;
    renderHook(() => useKeyboardInset(true));
    expect(kb()).toBe('240px');
  });

  it('limpa a variável e os ouvintes ao desmontar', () => {
    viewport.height = 450;
    const { unmount } = renderHook(() => useKeyboardInset(true));
    expect(viewport.listenerCount()).toBe(2);

    unmount();
    expect(kb()).toBe('');
    expect(viewport.listenerCount()).toBe(0);
  });

  it('não quebra em navegador sem visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    expect(() => renderHook(() => useKeyboardInset(true))).not.toThrow();
    expect(kb()).toBe('');
  });
});
