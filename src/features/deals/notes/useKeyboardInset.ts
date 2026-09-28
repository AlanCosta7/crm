/**
 * Mantém o composer visível quando o teclado do celular abre.
 *
 * No Android o layout encolhe sozinho e não haveria o que fazer. No iOS, não:
 * o teclado é desenhado por cima, `100vh` continua valendo a tela inteira e um
 * elemento fixo no rodapé fica escondido atrás dele. O `visualViewport` é a
 * única fonte confiável da altura realmente visível.
 *
 * O valor vai para a variável CSS `--kb`, que o composer usa como `bottom`.
 */
import { useEffect } from 'react';

export function useKeyboardInset(active: boolean) {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    const root = typeof document !== 'undefined' ? document.documentElement : undefined;
    if (!vv || !root) return;

    const clear = () => root.style.removeProperty('--kb');

    if (!active) {
      clear();
      return;
    }

    const update = () => {
      // Altura do teclado = o quanto a janela some abaixo da viewport visual
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Abaixo de 80px é barra de navegação do navegador, não teclado
      root.style.setProperty('--kb', inset > 80 ? `${Math.round(inset)}px` : '0px');
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      clear();
    };
  }, [active]);
}
