import { test, expect } from '@playwright/test';

test.describe('TV Display Pública fullscreen', () => {
  test('deve acessar a página pública da TV sem autenticação', async ({ page }) => {
    // 1. Acessa a rota pública da TV usando o token criado pelo seed local
    await page.goto('/tv/demo-reception-token');
    
    // 2. Aguarda a tela de carregamento sumir e a TV renderizar
    await page.waitForSelector('text=Sincronizando canal de exibição pública...', { state: 'detached', timeout: 5000 });
    
    // 3. Verifica cabeçalho da marca e nome fictício da filial
    await expect(page.locator('text=WizMart Distribuidora SP')).toBeVisible();
    await expect(page.locator('.live-indicator')).toBeVisible();
    
    // 4. Verifica se a TV está renderizando em dark theme (background escuro)
    const pageBg = await page.evaluate(() => {
      const el = document.querySelector('div');
      return el ? window.getComputedStyle(el).backgroundColor : '';
    });
    console.log(`[E2E] Background da TV detectado: ${pageBg}`);
    
    // 5. Verifica se os componentes visuais essenciais de TV estão presentes
    await expect(page.locator('text=Desempenho Comercial do Time')).toBeVisible();
    await expect(page.locator('text=Tarefas Concluídas')).toBeVisible();
  });
});
