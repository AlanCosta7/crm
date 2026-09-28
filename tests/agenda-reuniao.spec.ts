/**
 * agenda-reuniao.spec.ts — Fase 3 do PLANO_DESENHO_CRM.md
 *
 * A régua de agenda (slide 8) precisa da data do compromisso. Mover um card para
 * "Reunião Agendada" abre um modal que pede essa data — sem ela o servidor não
 * tem como calcular a confirmação "24h úteis antes".
 *
 * O card usado é o `deal-legado-lp` do seed ("Mercado do Bairro"), que nasce em
 * Prospecção no board do WizMart. Os testes rodam em série porque o segundo
 * move o card de verdade.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const CARD = 'Mercado do Bairro';

async function loginMaster(page: Page) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click('text=Master');
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
}

async function abrirBoardWizmart(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Pipeline', exact: true }).first().click();
  await page.waitForURL('**/pipeline');
  await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();
  await expect(page.locator('.kcol-hd .nm', { hasText: 'Reunião Agendada' })).toHaveCount(1);
}

/**
 * Arrasta um card para uma coluna disparando os eventos HTML5 de drag.
 *
 * `locator.dragTo()` move o mouse, mas o Kanban usa a API NATIVA de drag and
 * drop (onDragStart / onDragOver / onDrop). No Chromium headless esses eventos
 * não chegaram ao React — o card não saía do lugar e o modal nunca abria.
 * Disparar os eventos com um DataTransfer compartilhado é o caminho estável.
 */
async function arrastar(page: Page, origem: Locator, destino: Locator) {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await origem.dispatchEvent('dragstart', { dataTransfer: dt });
  await destino.dispatchEvent('dragover', { dataTransfer: dt });
  await destino.dispatchEvent('drop', { dataTransfer: dt });
  await origem.dispatchEvent('dragend', { dataTransfer: dt });
}

const coluna = (page: Page, nome: string) =>
  page.locator('.kcol', { has: page.locator('.kcol-hd .nm', { hasText: new RegExp(`^${nome}$`) }) });

test.describe.serial('Fase 3 — agendar reunião pede a data', () => {
  test('arrastar para Reunião Agendada abre o modal; cancelar não move o card', async ({ page }) => {
    await loginMaster(page);
    await abrirBoardWizmart(page);

    const card = page.locator('.kcard', { hasText: CARD });
    await expect(card).toBeVisible();
    await arrastar(page, card, coluna(page, 'Reunião Agendada'));

    const modal = page.locator('.modal', { has: page.getByRole('heading', { name: 'Agendar Reunião' }) });
    await expect(modal).toBeVisible();
    // A sugestão padrão já tem espaço para a régua — nenhum aviso de régua vazia.
    await expect(modal.getByRole('status')).toHaveCount(0);

    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(coluna(page, 'Reunião Agendada').locator('.kcard', { hasText: CARD })).toHaveCount(0);
  });

  test('confirmar a data move o card para Reunião Agendada', async ({ page }) => {
    await loginMaster(page);
    await abrirBoardWizmart(page);

    await arrastar(page, page.locator('.kcard', { hasText: CARD }), coluna(page, 'Reunião Agendada'));
    const modal = page.locator('.modal', { has: page.getByRole('heading', { name: 'Agendar Reunião' }) });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Agendar', exact: true }).click();

    await expect(coluna(page, 'Reunião Agendada').locator('.kcard', { hasText: CARD })).toBeVisible();
  });
});
