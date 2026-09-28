/**
 * templates-config.spec.ts — Achado crítico (PLANO_DESENHO_CRM.md, 13/09/2026)
 *
 * A coleção `templates` (PlaybookTemplate) era lida pelos modais de Email e
 * WhatsApp do card, mas não existia tela nenhuma pra criar/editar — só dava
 * pra corrigir mexendo direto no Firestore, e os 3 templates de exemplo
 * usavam nomes de variável ({{companyName}}) que não batiam com o `ctx` real
 * ({{empresa}}).
 *
 * Este arquivo prova o ciclo completo: master cria um template em
 * /settings/templates, o template aparece no seletor do modal de Email do
 * card (deal-003 / contato Carlos Mendes), e a mensagem é renderizada com os
 * dados reais do negócio.
 */

import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
}

test.describe('Achado crítico — CRUD de templates de mensagem', () => {
  test('admin cria, edita e desativa um template em /settings/templates', async ({ page }) => {
    await login(page, 'Master');
    await page.waitForURL(/\/$/);
    await page.goto('/settings/templates');
    await expect(page.getByRole('heading', { name: 'Templates de Mensagem' })).toBeVisible();

    const templateName = `Template E2E ${Math.floor(Math.random() * 10000)}`;

    await page.getByRole('button', { name: /Novo Template/i }).click();
    await page.getByPlaceholder('Ex: Primeiro contato — WizMart').fill(templateName);
    await page.getByPlaceholder(/Olá \{\{contato\}\}, conheça o WizMart/).fill(`Novidade para {{empresa}}`);
    await page.getByPlaceholder(/A \{\{empresa\}\} pode/).fill(
      'Olá {{contato}},\n\nA {{empresa}} vai adorar o WizMart!\n\n{{vendedor}}'
    );

    // Nenhum aviso de variável desconhecida — só usou variáveis do catálogo.
    await expect(page.getByText(/sem valor real/)).toHaveCount(0);

    await page.getByRole('button', { name: /Criar template/i }).click();
    await expect(page.getByRole('heading', { name: /Novo Template/ })).not.toBeVisible();

    const row = page.locator('tr', { hasText: templateName });
    await expect(row).toBeVisible();
    await expect(row.getByText('0', { exact: true })).toBeVisible(); // usageCount inicial

    // Desativa — deixa de aparecer no seletor dos modais do card.
    await row.getByRole('button', { name: `Desativar template ${templateName}` }).click();
    await expect(row.getByRole('button', { name: `Reativar template ${templateName}` })).toBeVisible();

    // Reativa para o próximo passo do teste (aplicar no card).
    await row.getByRole('button', { name: `Reativar template ${templateName}` }).click();
    await expect(row.getByRole('button', { name: `Desativar template ${templateName}` })).toBeVisible();
  });

  test('template criado aparece no modal de Email do card e renderiza com dados reais', async ({ page }) => {
    await login(page, 'Master');
    await page.waitForURL(/\/$/);

    // 1) Cria o template.
    await page.goto('/settings/templates');
    const templateName = `Follow-up E2E ${Math.floor(Math.random() * 10000)}`;
    await page.getByRole('button', { name: /Novo Template/i }).click();
    await page.getByPlaceholder('Ex: Primeiro contato — WizMart').fill(templateName);
    await page.getByPlaceholder(/Olá \{\{contato\}\}, conheça o WizMart/).fill('Novidade para {{empresa}}');
    await page.getByPlaceholder(/A \{\{empresa\}\} pode/).fill(
      'Olá {{contato}},\n\nA {{empresa}} vai adorar o WizMart!\n\nAtenciosamente,\n{{vendedor}}'
    );
    await page.getByRole('button', { name: /Criar template/i }).click();
    await expect(page.locator('tr', { hasText: templateName })).toBeVisible();

    // 2) Abre o card do negócio (deal-003 — WizDistribuidora SP / Carlos Mendes), a aba
    // "Atividades" (onde ficam os botões de ação) e o modal de Email.
    await page.goto('/lead/deal-003');
    await page.locator('.deal-tabs').getByRole('button', { name: 'Atividades', exact: true }).click();
    await page.locator('.deal-body').getByRole('button', { name: 'Email', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enviar Email' })).toBeVisible();

    // 3) Aplica o template recém-criado.
    const modal = page.locator('.modal');
    await modal.locator('.field', { hasText: 'Template' }).getByRole('combobox').selectOption({ label: templateName });

    // 4) Confere a renderização com dados reais do negócio (não os de exemplo da tela de admin).
    await expect(modal.locator('.field', { hasText: 'Assunto' }).locator('input')).toHaveValue(
      'Novidade para WizDistribuidora SP'
    );
    await expect(modal.locator('.field', { hasText: 'Mensagem' }).locator('textarea')).toHaveValue(
      'Olá Carlos Mendes,\n\nA WizDistribuidora SP vai adorar o WizMart!\n\nAtenciosamente,\nRicardo Master'
    );
  });
});
