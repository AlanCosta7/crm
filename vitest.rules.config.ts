import { defineConfig } from 'vitest/config';

/**
 * Config separada para os testes de Security Rules.
 *
 * Rodam em Node (não em happy-dom) e exigem os emuladores de Firestore e
 * Storage no ar — use `npm run test:rules`, que sobe tudo via
 * `firebase emulators:exec` com a config de portas alternativas
 * (firebase.emutest.json), sem colidir com o emulador de desenvolvimento.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    // subir o ambiente de rules depende dos emuladores responderem; em
    // máquina carregada 30s ficam apertados
    hookTimeout: 90000,
    fileParallelism: false,
  },
});
