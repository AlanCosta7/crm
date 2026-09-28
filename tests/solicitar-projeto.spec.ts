/**
 * solicitar-projeto.spec.ts — PLANO_DESENHO_CRM_2.md, Fase A (slides 4–6 + Word)
 *
 * Fluxo completo, sem `test.skip` (o Flow 5 antigo de v3-flows.spec.ts pulava
 * quando a fila estava vazia e passava sem testar nada):
 *   Rep acha o botão → solicita COM foto → o histórico do card registra →
 *   Design vê o pedido e a foto, pega e entrega COM PDF → o Rep vê a entrega no
 *   histórico do card, na tela de Projetos e no sino.
 *
 * `deal-032` é um card WizMart SEM `mainProduct` (como o CSN do cliente), só da
 * Carla. Os testes rodam em série: cada passo depende do anterior.
 */
import { test, expect, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const DEAL = '/lead/deal-032';

async function login(page: Page, label: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`button:has-text("${label}")`);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  // Sem esperar o shell, o goto seguinte corre com a auth ainda hidratando e o guard devolve ao Dashboard.
  await page.getByRole('navigation').waitFor();
  await page.waitForTimeout(500);
}

async function abrirHistorico(page: Page) {
  await page.goto(DEAL);
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
}

test.describe.serial('Fase A — Solicitação de Projeto ponta a ponta', () => {
  test('o botão aparece no card sem mainProduct — só para quem participa', async ({ page }) => {
    await login(page, 'Carla');
    await page.goto(DEAL);
    await expect(page.getByRole('button', { name: 'Solicitar Projeto' }).first()).toBeVisible();
  });

  test('viewer e design NÃO veem o botão (as rules negariam o envio)', async ({ page }) => {
    await login(page, 'Paulo');
    await page.goto(DEAL);
    await expect(page.getByText('CSN - Volta Redonda').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solicitar Projeto' })).toHaveCount(0);
  });

  test('rep solicita com quantidade travada em 10 e uma foto anexada', async ({ page }) => {
    await login(page, 'Carla');
    await page.goto(DEAL);
    await page.getByRole('button', { name: 'Solicitar Projeto' }).first().click();

    await page.getByText('Nanomarket').click();
    await expect(page.getByText('Loja', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Próximo/ }).click();

    const mais = page.getByRole('button', { name: 'Aumentar Luminária WizMart' });
    for (let i = 0; i < 12; i++) await mais.click({ force: true });
    await expect(mais).toBeDisabled();
    await page.getByRole('button', { name: 'Aumentar Quantidade de Gôndola' }).click();
    await page.getByRole('button', { name: /Próximo/ }).click();

    await page.getByPlaceholder(/parede frontal/).fill('3,00m x 2,80m');
    await page.getByTestId('project-file-input').setInputFiles({ name: 'local.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('project-upload-item').filter({ hasText: 'local.png' })).toContainText(/KB|B$/, { timeout: 20_000 });

    await page.getByRole('button', { name: /Enviar solicitação/ }).click();
    await expect(page.getByText('Anexar fotos e vídeos')).toHaveCount(0, { timeout: 15_000 });
  });

  test('o Histórico do card registra a solicitação (o pedido do Word)', async ({ page }) => {
    await login(page, 'Carla');
    await abrirHistorico(page);
    await expect(page.getByText(/Projeto de layout solicitado por/)).toBeVisible({ timeout: 20_000 });
  });

  test('o Design vê o pedido COM a foto, pega e entrega com PDF', async ({ page }) => {
    await login(page, 'Fernanda D.');
    await page.locator('.sidebar').getByText('Fila de Projetos').first().click();
    await page.waitForURL('**/design-queue');

    const pedido = page.locator('.card', { hasText: 'CSN' }).first();
    await expect(pedido).toBeVisible();
    await expect(pedido.getByTestId('anexo-solicitacao').filter({ hasText: 'local.png' })).toBeVisible();

    await pedido.getByRole('button', { name: /Pegar este projeto/ }).click();
    const meu = page.locator('.card', { hasText: 'EM ANDAMENTO' }).first();
    await meu.getByRole('button', { name: /Marcar como entregue/ }).click();
    await meu.getByTestId('project-file-input').setInputFiles({ name: 'layout-csn.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(meu.getByTestId('project-upload-item').filter({ hasText: 'layout-csn.pdf' })).toContainText(/KB|B$/, { timeout: 20_000 });
    await meu.getByRole('button', { name: /Confirmar entrega/ }).click();
    // Outros pedidos do seed podem continuar na fila; o que importa é este ter saído dela.
    await expect(page.locator('.card', { hasText: 'CSN' })).toHaveCount(0, { timeout: 15_000 });
  });

  test('o Rep vê o ciclo inteiro no Histórico do card, com o arquivo entregue', async ({ page }) => {
    await login(page, 'Carla');
    await abrirHistorico(page);
    await expect(page.getByText(/Projeto de layout solicitado por/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Projeto de layout em andamento — Fernanda/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Projeto de layout entregue por Fernanda/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('link-entrega').filter({ hasText: 'layout-csn.pdf' })).toBeVisible();
  });

  test('e vê a entrega na tela Projetos e o aviso no sino', async ({ page }) => {
    await login(page, 'Carla');
    await page.goto('/projetos');
    await page.getByRole('button', { name: /Entregue/ }).first().click();
    await page.getByText('CSN').first().click();
    await expect(page.getByTestId('entrega').getByText('layout-csn.pdf')).toBeVisible();

    await page.getByRole('button', { name: 'Notificações' }).click();
    await expect(page.getByText('Seu projeto de layout foi entregue')).toBeVisible({ timeout: 15_000 });
  });
});
