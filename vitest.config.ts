import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Testes de UI com Testing Library + happy-dom digitam tecla a tecla e
    // montam árvores grandes; 5s (padrão) estoura sem que nada esteja errado.
    testTimeout: 15000,
  },
});
