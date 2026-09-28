/**
 * playwright.emutest.config.ts — E2E no segundo conjunto de portas
 *
 * Existe para o E2E rodar sem colidir com um emulador de desenvolvimento já
 * ativo na máquina (o motivo pelo qual o Playwright ficou sem rodar no ciclo de
 * jul/2026). Usa as portas de `firebase.emutest.json` e um dev server numa porta própria (5199), fora das
 * usadas pelo dev do CRM (5173) e pelo Rep App (5174).
 *
 * Uso: npm run test:e2e:emutest
 */
import { defineConfig, devices } from '@playwright/test';

const EMU_ENV = {
  VITE_EMU_AUTH_PORT: '9098',
  VITE_EMU_FIRESTORE_PORT: '8081',
  VITE_EMU_DATABASE_PORT: '9001',
  VITE_EMU_FUNCTIONS_PORT: '5002',
  VITE_EMU_STORAGE_PORT: '9198',
};

export default defineConfig({
  testDir: './tests',
  testMatch: ['pipe-unico.spec.ts', 'dashboard-origem.spec.ts', 'blocos-horario.spec.ts', 'agenda-reuniao.spec.ts', 'minha-comissao.spec.ts', 'financeiro-contratos.spec.ts', 'session-auditoria.spec.ts', 'solicitar-projeto.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 60000,
    env: EMU_ENV,
  },
});
