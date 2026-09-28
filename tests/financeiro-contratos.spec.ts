/**
 * financeiro-contratos.spec.ts — Fase 5.4 do PLANO_DESENHO_CRM.md
 *
 * Slide 11 do deck: "...um 'check' para alguém do time financeiro clicar
 * dizendo que foi pago." O seed grava dois comodatos: `deal-026` (HSL Hospital
 * SP) com contrato pendente, e `deal-027` (Rede Caffè SP) já validado.
 *
 * `describe.serial`, de propósito: os testes rodam contra o MESMO emulador
 * (sem reset entre `it`s), e "confirmar pagamento" MUTA `deal-026` de verdade.
 * Ele fica por último; os demais leem o estado original do seed.
 */

import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
}

async function abrirFilaDeContratos(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Contratos Comodato', exact: true }).first().click();
  await page.waitForURL('**/financeiro/contratos');
}

test.describe.serial('Fase 5.4 — fila do financeiro', () => {
  test('financeiro vê o pendente e o já validado, cada um na seção certa', async ({ page }) => {
    await login(page, 'Financeiro');
    await abrirFilaDeContratos(page);

    const pendentes = page.locator('.card', { hasText: 'Pendentes de validação' });
    await expect(pendentes.getByText('HSL Hospital SP')).toBeVisible();
    await expect(pendentes.getByRole('button', { name: /Confirmar Pagamento/ })).toBeVisible();

    const validados = page.locator('.card', { hasText: 'Já validados' });
    await expect(validados.getByText('Rede Caffè SP')).toBeVisible();
    // O já validado não tem botão de confirmar — já foi confirmado.
    await expect(validados.getByRole('button', { name: /Confirmar Pagamento/ })).toHaveCount(0);
  });

  test('quem não é financeiro/master/manager não acessa a fila', async ({ page }) => {
    await login(page, 'SDR');
    await page.goto('/financeiro/contratos');
    await page.waitForURL(url => !url.pathname.endsWith('/financeiro/contratos'));
  });

  test('o slot de contrato aparece no card do Comodato, ainda pendente', async ({ page }) => {
    // deal-026 é do rep-002 (Roberto); o quick-login "Rep" entra como rep-001
    // (Carla), que não participa deste card — Master vê qualquer deal.
    // Roda ANTES do teste que confirma o pagamento: depois dele deal-026 já
    // estaria pago, e esta asserção deixaria de fazer sentido.
    await login(page, 'Master');
    await page.goto('/lead/deal-026');

    const slot = page.locator('.card', { hasText: 'Contrato de Comodato' });
    await expect(slot).toBeVisible();
    await expect(slot.getByText('Aguardando validação do financeiro')).toBeVisible();
    await expect(slot.getByText('Contrato HSL.pdf')).toBeVisible();
  });

  // Último de propósito: MUTA deal-026 de verdade no emulador compartilhado.
  test('confirmar pagamento move o card de pendente para validado, ao vivo', async ({ page }) => {
    await login(page, 'Financeiro');
    await abrirFilaDeContratos(page);

    const pendentes = page.locator('.card', { hasText: 'Pendentes de validação' });
    await expect(pendentes.getByText('HSL Hospital SP')).toBeVisible();

    await pendentes.getByRole('button', { name: /Confirmar Pagamento/ }).click();

    // Some da lista de pendentes...
    await expect(pendentes.getByText('HSL Hospital SP')).toHaveCount(0);
    // ...e aparece nos validados, sem precisar recarregar a página.
    const validados = page.locator('.card', { hasText: 'Já validados' });
    await expect(validados.getByText('HSL Hospital SP')).toBeVisible();
  });
});
