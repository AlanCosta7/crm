/**
 * pipe-unico.spec.ts — Fase 1.3 do PLANO_DESENHO_CRM.md
 *
 * O deck "Desenho CRM" (slide 1) pede: "Gostaria de uma visão única do Pipe.
 * Sem distinção entre Inbound e Outbound." Antes, cada funil virava uma aba —
 * o WizMart aparecia quatro vezes (`BDR - Outbound`, `Inbound — WizMart`,
 * `Outbound — WizMart`, `WizMart`). O seed reproduz esses quatro funis de
 * propósito (ver `scripts/seed/seed-emulators.mjs`), sem o que o problema não existe
 * fora de produção.
 *
 * O que cada teste prova na tela:
 *  1. Um board por produto — os funis legados do WizMart não viram aba. É o
 *     teste de REGRESSÃO da fase: verificado que falha se `pipelineBoards`
 *     voltar a listar um board por funil.
 *  2. Um card preso em funil legado aparece no board único (`dealBelongsToBoard`).
 *  3. A origem virou selo no card.
 *  4. O filtro de origem substitui a troca de board.
 */

import { test, expect } from '@playwright/test';

async function quickLogin(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  await page.waitForURL('**/');
}

async function goPipeline(page: import('@playwright/test').Page) {
  // `text=Pipeline` casaria primeiro com o CABEÇALHO da seção da sidebar (um
  // div, não clicável) — daí o locator por role, que pega só o item de menu.
  await page.locator('.sidebar').getByRole('button', { name: 'Pipeline', exact: true }).first().click();
  await page.waitForURL('**/pipeline');
  await expect(page.locator('text=Lista Potencial').first()).toBeVisible();
}

test.describe('Fase 1.3 — visão única do Pipe', () => {
  test('os funis legados do WizMart não viram aba própria', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);

    const subbar = page.locator('.subbar');

    // As asserções POSITIVAS vêm primeiro de propósito: `toHaveCount(0)` passa
    // trivialmente enquanto os funis ainda não carregaram, e aí o teste não
    // provaria nada. Esperar as abas que DEVEM existir garante que a lista já
    // está montada quando checamos as que não devem.
    await expect(subbar.getByRole('button', { name: /^WizMart/ })).toHaveCount(1);
    await expect(subbar.getByRole('button', { name: /^Smart Café/ })).toHaveCount(1);

    // Os três nomes de funil legado do seed não podem aparecer como aba.
    await expect(subbar.getByRole('button', { name: /BDR - Outbound/ })).toHaveCount(0);
    await expect(subbar.getByRole('button', { name: /Inbound — WizMart/ })).toHaveCount(0);
    await expect(subbar.getByRole('button', { name: /Outbound — WizMart/ })).toHaveCount(0);
  });

  test('card preso em funil legado aparece no board único do WizMart', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();

    // deal-legado-lp mora em `inbound-wizmart`; deal-legado-out em `bdr-outbound`.
    await expect(page.locator('.kcard', { hasText: 'Mercado do Bairro' })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: 'Atacado Vale Verde' })).toBeVisible();
  });

  test('a origem aparece como selo no card', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();

    // O card vindo de Landing Page é Inbound; o do BDR é Outbound.
    const inbound = page.locator('.kcard', { hasText: 'Mercado do Bairro' });
    await expect(inbound.locator('.badge', { hasText: /^In$/ })).toBeVisible();

    const outbound = page.locator('.kcard', { hasText: 'Atacado Vale Verde' });
    await expect(outbound.locator('.badge', { hasText: /^Out$/ })).toBeVisible();
  });

  test('o filtro de origem separa Inbound de Outbound sem trocar de board', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();

    const filtro = page.locator('.subbar .seg').first();
    await expect(filtro.getByRole('button', { name: /Inbound/ })).toBeVisible();

    // Filtrando Inbound, sobra o card da Landing Page e sai o do BDR.
    await filtro.getByRole('button', { name: /Inbound/ }).click();
    await expect(page.locator('.kcard', { hasText: 'Mercado do Bairro' })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: 'Atacado Vale Verde' })).toHaveCount(0);

    // Filtrando Outbound, o inverso.
    await filtro.getByRole('button', { name: /Outbound/ }).click();
    await expect(page.locator('.kcard', { hasText: 'Atacado Vale Verde' })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: 'Mercado do Bairro' })).toHaveCount(0);

    // E "Todas" traz os dois de volta.
    await filtro.getByRole('button', { name: /Todas/ }).click();
    await expect(page.locator('.kcard', { hasText: 'Mercado do Bairro' })).toBeVisible();
    await expect(page.locator('.kcard', { hasText: 'Atacado Vale Verde' })).toBeVisible();
  });
});

test.describe('Fase 1.1 — etapas de Reunião no funil WizMart', () => {
  test('o board do WizMart tem Reunião Agendada e Realizada entre Conectado e Visita', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();

    const colunas = page.locator('.kcol-hd .nm');
    await expect(colunas.filter({ hasText: 'Reunião Agendada' })).toHaveCount(1);
    await expect(colunas.filter({ hasText: 'Reunião Realizada' })).toHaveCount(1);

    // A ordem importa: reunião vem depois de Conectado e antes da Visita.
    const nomes = await colunas.allInnerTexts();
    const i = (n: string) => nomes.findIndex(x => x.trim() === n);
    expect(i('Conectado')).toBeLessThan(i('Reunião Agendada'));
    expect(i('Reunião Agendada')).toBeLessThan(i('Reunião Realizada'));
    expect(i('Reunião Realizada')).toBeLessThan(i('Visita Agendada'));
  });

  test('as duas etapas mostram SLA de 3 dias úteis', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^WizMart/ }).click();

    for (const nome of ['Reunião Agendada', 'Reunião Realizada']) {
      const col = page.locator('.kcol', { has: page.locator('.nm', { hasText: nome }) });
      await expect(col.getByText('SLA: 3 dias úteis')).toBeVisible();
    }
  });

  // O Alan confirmou (10/09/2026) que o Smart Café não precisa das etapas de
  // reunião — lá o porte do cliente já decide o caminho pelo `connectionType`.
  test('o Smart Café NÃO recebeu as etapas de reunião', async ({ page }) => {
    await quickLogin(page, 'Master');
    await goPipeline(page);
    await page.locator('.subbar').getByRole('button', { name: /^Smart Café/ }).click();

    // Espera o board do Smart Café montar antes de afirmar ausência.
    await expect(page.locator('.kcol-hd .nm', { hasText: 'Degustação Agendada' })).toHaveCount(1);
    await expect(page.locator('.kcol-hd .nm', { hasText: 'Reunião Agendada' })).toHaveCount(0);
    await expect(page.locator('.kcol-hd .nm', { hasText: 'Reunião Realizada' })).toHaveCount(0);
  });
});
