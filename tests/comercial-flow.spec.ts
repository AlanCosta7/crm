import { test, expect } from '@playwright/test';

test.describe('Fluxo Comercial Completo (BDR -> SDR -> Representante)', () => {
  test('deve criar negócio como BDR, qualificar e fazer handoff como SDR, e aceitar como Representante', async ({ page }) => {
    // ==========================================
    // PASSO 1: Login do BDR e Criação do Negócio
    // ==========================================
    await page.goto('/');
    await page.waitForURL('**/login');
    
    // Login rápido de teste como BDR
    await page.click('text=BDR');
    await page.waitForURL('**/');
    await expect(page.locator('.crumb').locator('text=Dashboard')).toBeVisible();

    // Navega ao Pipeline
    await page.locator('.sidebar').locator('text=Pipeline').first().click();
    await page.waitForURL('**/pipeline');

    // Abre modal de Novo Negócio
    await page.click('text=Novo Negócio');
    await expect(page.locator('text=Novo Negócio —')).toBeVisible();

    // Preenche os campos do negócio
    const dealName = `Lead E2E Flow ${Math.floor(Math.random() * 1000)}`;
    await page.fill('input[placeholder="Ex: Renovação contrato 2026"]', dealName);
    await page.fill('input[placeholder="Razão social ou nome fantasia"]', 'Empresa Comercial E2E');
    await page.fill('input[placeholder="0"]', '25000');
    
    // Seleciona "Qualificação SDR" como estágio inicial
    await page.selectOption('select', { label: 'Qualificação SDR' });

    // Confirma criação
    await page.click('button:has-text("Criar Negócio")');
    await expect(page.locator('text=Novo Negócio —')).not.toBeVisible();

    // Verifica que o negócio foi inserido na coluna correspondente
    await expect(page.locator(`.kcard:has-text("${dealName}")`)).toBeVisible();

    // Realiza logout do BDR
    await page.click('button[title="Sair do Sistema"]');
    await page.waitForURL('**/login');

    // ==========================================
    // PASSO 2: Login do SDR e Handoff para o Rep
    // ==========================================
    // Login rápido como SDR
    await page.click('text=SDR');
    await page.waitForURL('**/');

    // Navega ao Pipeline
    await page.locator('.sidebar').locator('text=Pipeline').first().click();
    await page.waitForURL('**/pipeline');

    // Localiza o card do negócio e a coluna de destino (Visita Agendada)
    const card = page.locator(`.kcard:has-text("${dealName}")`);
    await expect(card).toBeVisible();

    const targetCol = page.locator('.kcol').filter({ hasText: 'Visita Agendada' });
    await expect(targetCol).toBeVisible();

    // Executa a ação de arrastar (drag and drop)
    await card.dragTo(targetCol);

    // O HandoffModal deve ser aberto automaticamente (estágio exige handoff)
    await expect(page.locator('text=Passagem de Bastão')).toBeVisible();

    // Preenche formulário de handoff
    // Seleciona canal de follow-up: WhatsApp
    await page.click('button:has-text("WhatsApp")');
    
    // Seleciona tipo de visita: Video call
    await page.click('button:has-text("Video call")');

    // Preenche data e hora da visita (amanhã)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateString = tomorrow.toISOString().slice(0, 16); // Formato YYYY-MM-DDTHH:MM
    await page.fill('input[type="datetime-local"]', dateString);

    // Seleciona Representante "Carla Rep"
    await page.click('text=Carla Rep');

    // Preenche notas de handoff
    await page.fill('textarea[placeholder*="Contexto"]', 'Lead qualificado via E2E Flow. Muito interesse.');

    // Envia o Handoff
    await page.click('button:has-text("Confirmar Handoff")');
    await expect(page.locator('text=Passagem de Bastão')).not.toBeVisible();

    // Verifica que o deal original foi convertido no pipeline Inbound
    await expect(page.locator(`.kcard:has-text("${dealName}")`).locator('text=Convertido')).toBeVisible();

    // Realiza logout do SDR
    await page.click('button[title="Sair do Sistema"]');
    await page.waitForURL('**/login');

    // ==========================================
    // PASSO 3: Login do Representante e Aceite
    // ==========================================
    // Login rápido como Representante
    await page.click('text=Representante');
    await page.waitForURL('**/');

    // Navega para a página de Handoffs
    await page.locator('.sidebar').locator('text=Handoffs').first().click();
    await page.waitForURL('**/handoffs');

    // Encontra o handoff pendente do deal
    const handoffCard = page.locator(`.card:has-text("${dealName}")`);
    await expect(handoffCard).toBeVisible();
    await expect(handoffCard.locator('text=Aguardando Aceite')).toBeVisible();

    // Clica em aceitar o handoff
    await handoffCard.locator('button:has-text("Aceitar handoff")').click();

    // Aguarda o processamento (o card pendente deve sumir)
    await expect(handoffCard.locator('button:has-text("Aceitar handoff")')).not.toBeVisible();

    // Alterna para a aba de Aceitos
    await page.click('button:has-text("Aceitos")');

    // Verifica que o handoff consta agora sob os aceitos
    const acceptedCard = page.locator(`.card:has-text("${dealName}")`);
    await expect(acceptedCard).toBeVisible();
    await expect(acceptedCard.locator('text=Aceito')).toBeVisible();
  });
});
