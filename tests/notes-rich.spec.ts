/**
 * notes-rich.spec.ts — E2E da aba Notas do card.
 *
 * Cobre o caminho que o time percorre de verdade: escrever com markdown,
 * anexar um documento, editar a nota, marcar um item da checklist e excluir —
 * tudo contra os emuladores (Firestore + Storage), com as rules valendo.
 *
 * Roda com `npm run test:e2e:local`, que sobe os emuladores, semeia os dados e
 * executa o Playwright.
 */

import { test, expect, type Page } from '@playwright/test';

/** Login pelo botão de acesso demo da tela de login. */
async function quickLogin(page: Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  await page.waitForURL('**/');
}

/** Abre o primeiro card do pipeline e vai para a aba Notas. */
async function openNotesTab(page: Page) {
  await page.locator('.sidebar').locator('text=Pipeline').first().click();
  await page.waitForURL('**/pipeline');

  await page.locator('.kcard').first().click();
  await expect(page.locator('.deal-panel')).toBeVisible();

  await page.locator('.deal-panel').locator('button:has-text("Notas")').click();
  await expect(page.getByLabel('Corpo da nota')).toBeVisible();
}

/** PDF mínimo válido, para exercitar o upload sem depender de arquivo no repo. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  'utf8'
);

test.describe('Aba Notas — markdown', () => {
  test('escreve uma nota com markdown e vê o texto formatado na timeline', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    const texto = `Cliente pediu **desconto** de 10% — E2E ${Date.now()}`;
    await page.getByLabel('Corpo da nota').fill(texto);

    // A prévia mostra o markdown renderizado antes de salvar
    await page.getByRole('tab', { name: 'Visualizar' }).click();
    await expect(page.locator('.note-preview strong')).toHaveText('desconto');

    await page.getByRole('tab', { name: 'Escrever' }).click();
    await page.getByRole('button', { name: /registrar nota/i }).click();

    const nota = page.locator('.note-item').first();
    await expect(nota).toBeVisible();
    await expect(nota.locator('strong')).toHaveText('desconto');
    await expect(nota.locator('.note-author')).toHaveText('Você');
  });

  test('a toolbar aplica formatação sobre a seleção', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    const campo = page.getByLabel('Corpo da nota');
    await campo.fill('urgente');
    await campo.selectText();
    await page.getByRole('button', { name: /negrito/i }).click();

    await expect(campo).toHaveValue('**urgente**');
  });

  test('checklist criada na nota fica clicável para o autor', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.getByLabel('Corpo da nota').fill('- [ ] ligar para o cliente');
    await page.getByRole('button', { name: /registrar nota/i }).click();

    const checkbox = page.locator('.note-item').first().getByRole('checkbox').first();
    await expect(checkbox).toBeEnabled();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});

test.describe('Aba Notas — edição e exclusão', () => {
  test('autor edita a própria nota e ganha o selo "editada"', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.getByLabel('Corpo da nota').fill(`Texto original ${Date.now()}`);
    await page.getByRole('button', { name: /registrar nota/i }).click();

    const nota = page.locator('.note-item').first();
    await nota.getByRole('button', { name: 'Ações da nota' }).click();
    await page.getByRole('menuitem', { name: /editar/i }).click();

    await page.getByLabel('Corpo da nota').fill('Texto corrigido');
    await page.getByRole('button', { name: /salvar alterações/i }).click();

    await expect(page.locator('.note-item').first()).toContainText('Texto corrigido');
    await expect(page.locator('.note-item').first().locator('.note-edited')).toBeVisible();
  });

  test('autor exclui a nota depois de confirmar', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    const marca = `Para excluir ${Date.now()}`;
    await page.getByLabel('Corpo da nota').fill(marca);
    await page.getByRole('button', { name: /registrar nota/i }).click();
    await expect(page.locator('.note-item').first()).toContainText(marca);

    await page.locator('.note-item').first().getByRole('button', { name: 'Ações da nota' }).click();
    await page.getByRole('menuitem', { name: /excluir/i }).click();
    await expect(page.getByText('Excluir esta nota?')).toBeVisible();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();

    await expect(page.locator('.note-item').filter({ hasText: marca })).toHaveCount(0);
  });
});

test.describe('Aba Notas — anexos', () => {
  test('anexa um PDF, salva e o documento aparece com link de download', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.getByLabel('Corpo da nota').fill(`Segue a proposta ${Date.now()}`);
    await page.locator('.note-composer input[type="file"]').first().setInputFiles({
      name: 'Proposta Comercial.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_BYTES,
    });

    // Enquanto sobe, salvar fica bloqueado
    const chip = page.locator('.att-chip').first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Proposta Comercial.pdf');

    const salvar = page.getByRole('button', { name: /registrar nota|enviando anexos/i });
    await expect(salvar).toBeEnabled({ timeout: 15000 });
    await salvar.click();

    const anexo = page.locator('.note-item').first().locator('.att-card');
    await expect(anexo).toBeVisible();
    await expect(anexo.locator('.att-card-name')).toHaveText('Proposta Comercial.pdf');
    await expect(anexo.locator('a')).toHaveAttribute('href', /.+/);
  });

  test('recusa tipo fora da allowlist com mensagem específica', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.locator('.note-composer input[type="file"]').first().setInputFiles({
      name: 'malicioso.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg onload="alert(1)"></svg>', 'utf8'),
    });

    const chip = page.locator('.att-chip-error').first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('não suportado');
  });

  test('autor remove o anexo antes de salvar a nota', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.locator('.note-composer input[type="file"]').first().setInputFiles({
      name: 'temporario.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_BYTES,
    });

    const chip = page.locator('.att-chip').first();
    await expect(chip).toBeVisible();
    await chip.getByRole('button').click();

    await expect(page.locator('.att-chip')).toHaveCount(0);
  });
});

test.describe('Aba Notas — permissões', () => {
  test('viewer lê as notas mas não tem editor', async ({ page }) => {
    await quickLogin(page, 'Visualizador');
    await page.locator('.sidebar').locator('text=Pipeline').first().click();
    await page.waitForURL('**/pipeline');
    await page.locator('.kcard').first().click();
    await page.locator('.deal-panel').locator('button:has-text("Notas")').click();

    await expect(page.getByLabel('Corpo da nota')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /registrar nota/i })).toHaveCount(0);
  });
});

test.describe('Aba Notas — menções', () => {
  test('digitar @ sugere o time e insere a menção como chip', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    const campo = page.getByLabel('Corpo da nota');
    await campo.fill('Preciso que ');
    await campo.press('@');
    await campo.pressSequentially('car');

    const lista = page.getByRole('listbox', { name: 'Mencionar pessoa' });
    await expect(lista).toBeVisible();
    await lista.getByRole('option').first().click();

    await expect(campo).toHaveValue(/\[@.+\]\(wm:user\/.+\)\s$/);

    await page.getByRole('button', { name: /registrar nota/i }).click();
    const chip = page.locator('.note-item').first().locator('.md-mention');
    await expect(chip).toBeVisible();
    // o esquema interno nunca vira link clicável no DOM
    await expect(page.locator('a[href^="wm:"]')).toHaveCount(0);
  });
});

test.describe('Aba Notas — celular', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test('o composer se ancora ao ganhar foco e some ao perder', async ({ page }) => {
    await quickLogin(page, 'SDR');
    await openNotesTab(page);

    await page.getByLabel('Corpo da nota').click();
    await expect(page.locator('.notes-tab-composing')).toBeVisible();

    await page.locator('.note-composer-backdrop').click();
    await expect(page.locator('.notes-tab-composing')).toHaveCount(0);
  });
});
