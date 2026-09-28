/**
 * blocos-horario.spec.ts — Fase 2 do PLANO_DESENHO_CRM.md
 *
 * Slide 6 do deck: a página de Atividades separada em blocos de horário.
 * Slide 9: "O SDR abriu o CRM e a primeira página é a de Atividades com o
 * Bloco de Horários."
 *
 * O que este arquivo prova na tela:
 *  1. O SDR cai em /activities ao entrar, já na aba "Meu Dia".
 *  2. A régua do slide 6 aparece com horário, rótulo e a pausa das 12h.
 *  3. O Dashboard continua acessível pela sidebar (o desvio é só no login).
 *  4. O admin configura os blocos em /settings/cadencia.
 */

import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
}

test.describe('Fase 2 — blocos de horário', () => {
  test('o SDR entra direto na fila do dia (slide 9)', async ({ page }) => {
    await login(page, 'SDR');
    await page.waitForURL('**/activities');

    await expect(page.getByRole('heading', { name: 'Atividades' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Meu Dia/ })).toBeVisible();
  });

  test('a régua do slide 6 aparece com horários, rótulos e a pausa', async ({ page }) => {
    await login(page, 'SDR');
    await page.waitForURL('**/activities');

    // Os seis blocos do deck.
    for (const label of ['E-mail', 'LinkedIn', 'Ligação', 'WhatsApp', 'Follow Up de Agenda']) {
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByText('10h', { exact: true })).toBeVisible();
    await expect(page.getByText('13h–15h', { exact: true })).toBeVisible();
    await expect(page.getByText(/Intervalo — nenhuma atividade/)).toBeVisible();
  });

  test('o histórico continua acessível na outra aba', async ({ page }) => {
    await login(page, 'SDR');
    await page.waitForURL('**/activities');

    await page.getByRole('button', { name: 'Histórico' }).click();
    // Os chips de filtro do feed antigo voltam a aparecer.
    await expect(page.locator('.chips')).toBeVisible();
    await expect(page.getByText(/Intervalo — nenhuma atividade/)).toHaveCount(0);
  });

  // Se o desvio fosse permanente, o item Dashboard da sidebar ficaria inútil.
  test('o SDR ainda alcança o Dashboard pela sidebar', async ({ page }) => {
    await login(page, 'SDR');
    await page.waitForURL('**/activities');

    await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).first().click();
    await page.waitForURL(/\/$/);
    await expect(page.getByText(/Cadência de hoje/)).toBeVisible();
  });

  test('quem não é SDR continua caindo no Dashboard', async ({ page }) => {
    await login(page, 'Master');
    await page.waitForURL(/\/$/);
    await expect(page.getByText(/Olá,.*👋/)).toBeVisible();
  });

  test('o admin configura os blocos na tela de cadência', async ({ page }) => {
    await login(page, 'Master');
    await page.waitForURL(/\/$/);
    await page.goto('/settings/cadencia');

    const painel = page.locator('.card', { hasText: 'Blocos de Horário do Dia' });
    await expect(painel).toBeVisible();

    // Seis linhas de bloco, cada uma com início e fim editáveis.
    await expect(painel.locator('input[type="time"]')).toHaveCount(12);
    await expect(painel.getByRole('button', { name: /Adicionar bloco/ })).toBeVisible();
    await expect(painel.getByRole('button', { name: /Restaurar padrão/ })).toBeVisible();
  });

  test('a tela avisa quando o mesmo canal fica em dois blocos', async ({ page }) => {
    await login(page, 'Master');
    await page.waitForURL(/\/$/);
    await page.goto('/settings/cadencia');

    const painel = page.locator('.card', { hasText: 'Blocos de Horário do Dia' });
    // Liga E-mail também no bloco das 11h (LinkedIn) — conflito com o das 10h.
    await painel.getByRole('button', { name: /^E-mail no bloco 11h$/ }).click();

    await expect(painel.getByText(/está em dois blocos/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar configuração/ })).toBeDisabled();
  });
});
