import { test, expect } from '@playwright/test';

test.describe('Kanban Pipeline - Simulação de Navegação', () => {
  test('deve redirecionar para login, entrar como Comercial e carregar o Kanban', async ({ page }) => {
    // 1. Acessa a raiz (deve redirecionar para /login se não logado)
    await page.goto('/');
    await page.waitForURL('**/login');
    
    // Verifica elementos de login
    await expect(page.locator('text=Bem-vindo ao CRM')).toBeVisible();
    
    // 2. Clica no botão de acesso rápido "Comercial" para realizar login de teste
    await page.click('text=Comercial');
    
    // 3. Aguarda redirecionamento para o dashboard
    await page.waitForURL('**/');
    await expect(page.locator('.crumb').locator('text=Dashboard')).toBeVisible();

    // 4. Navega até a página de Pipeline (Kanban) via roteamento client-side (Sidebar)
    await page.locator('.sidebar').locator('text=Pipeline').first().click();
    await page.waitForURL('**/pipeline');

    // 5. Verifica se as colunas principais do Kanban estão visíveis
    await expect(page.locator('text=Prospecção')).toBeVisible();
    await expect(page.locator('text=Qualificação')).toBeVisible();
    await expect(page.locator('text=Proposta')).toBeVisible();
    
    // 6. Verifica a existência de pelo menos um negócio (card) no painel
    const cards = page.locator('.kcard');
    const count = await cards.count();
    console.log(`[E2E] Encontrados ${count} negócios no Kanban.`);
    expect(count).toBeGreaterThan(0);
    
    // Verifica se o primeiro card possui informações acessíveis
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    
    // Abre o sidebar de detalhes ao clicar no card
    await firstCard.click();
    await expect(page.locator('.deal-panel')).toBeVisible();
    
    // Fecha o sidebar de detalhes
    await page.click('button[aria-label="Fechar painel"]');
    await expect(page.locator('.deal-panel')).not.toBeVisible();
  });
});
