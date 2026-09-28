/**
 * minha-comissao.spec.ts — Fase 5.1 do PLANO_DESENHO_CRM.md
 *
 * Slide 11 do deck "Desenho CRM": "SDR e Representante comissionaram
 * (individualmente, sem um ter a visão do outro)."
 *
 * O seed grava UMA comissão (`comm-001`, deal-016) com fatia para BDR, SDR e
 * Rep. Cada um dos três precisa ver a PRÓPRIA fatia — e nada além disso: nem o
 * total do card, nem o valor ou o nome de quem também assinou o mesmo card.
 */

import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  // SDR pousa em /activities (Fase 2); os demais, no Dashboard — não fixar rota.
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
}

async function abrirMinhaComissao(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Minha Comissão', exact: true }).first().click();
  await page.waitForURL('**/minha-comissao');
}

test.describe('Fase 5.1 — Minha Comissão', () => {
  test('o SDR vê a própria fatia, não o total nem a fatia dos colegas', async ({ page }) => {
    await login(page, 'SDR');
    await abrirMinhaComissao(page);

    await expect(page.getByText('Distribuição Regional — Conecta Log')).toBeVisible();
    // Aparece duas vezes: no card-resumo "A Receber" e na linha da tabela.
    await expect(page.getByText('R$ 240').first()).toBeVisible();

    // Nem o total do card, nem a fatia do BDR ou do Rep aparecem em lugar nenhum.
    await expect(page.getByText('R$ 864')).toHaveCount(0);
    await expect(page.getByText('R$ 560')).toHaveCount(0);
    await expect(page.getByText('R$ 64', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Carla Rep')).toHaveCount(0);
    await expect(page.getByText('Lucas BDR')).toHaveCount(0);
  });

  test('o Representante vê a própria fatia, não a do SDR nem a do BDR', async ({ page }) => {
    await login(page, 'Rep');
    await abrirMinhaComissao(page);

    await expect(page.getByText('R$ 560').first()).toBeVisible();
    await expect(page.getByText('R$ 864')).toHaveCount(0);
    await expect(page.getByText('R$ 240')).toHaveCount(0);
    await expect(page.getByText('João SDR')).toHaveCount(0);
  });

  test('o BDR também tem acesso à própria tela', async ({ page }) => {
    await login(page, 'BDR');
    await abrirMinhaComissao(page);

    await expect(page.getByText('R$ 64', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('R$ 864')).toHaveCount(0);
  });

  test('master/manager não têm o item "Minha Comissão" — eles usam a Calculadora e o Relatório', async ({ page }) => {
    await login(page, 'Master');
    await expect(page.locator('.sidebar').getByRole('button', { name: 'Minha Comissão', exact: true })).toHaveCount(0);
    await expect(page.locator('.sidebar').getByRole('button', { name: 'Comissões', exact: true })).toBeVisible();
  });

  test('master acessando a URL direto é redirecionado — a rota é só bdr/sdr/rep', async ({ page }) => {
    await login(page, 'Master');
    await page.goto('/minha-comissao');
    await page.waitForURL(url => !url.pathname.endsWith('/minha-comissao'));
  });
});
