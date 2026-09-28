/**
 * contato-vinculado-card.spec.ts — Vínculo de Contato no Card (DealSidebar)
 *
 * Cobre o achado crítico do PLANO_DESENHO_CRM.md (13/09/2026): os modais de
 * Email/WhatsApp resolviam o destinatário comparando `contact.company` com
 * `deal.company` por string — frágil a ponto de nunca pré-preencher o
 * destinatário quando os nomes não batem exatamente. Este teste valida o
 * fluxo completo: abrir um card sem contato vinculado (o "Para" do email vem
 * vazio mesmo existindo contatos cadastrados), vincular um contato novo pelo
 * seletor inline, e confirmar que o email passa a vir preenchido
 * automaticamente — sem depender de nenhuma coincidência de nome de empresa.
 */

import { test, expect } from '@playwright/test';

async function quickLogin(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  await page.waitForURL('**/');
}

test.describe('Vínculo de Contato no Card', () => {
  test('card sem contato vinculado → vincular pelo seletor → email vem preenchido automaticamente', async ({ page }) => {
    const dealName = `E2E Contato Card ${Date.now()}`;
    // Nome de empresa deliberadamente "torto" em relação a qualquer contato
    // pré-existente — simula o cenário real que quebrava o match por string.
    const dealCompany = `Distribuidora E2E ${Date.now()}`;
    const contactName = 'Fernanda Compradora E2E';
    const contactEmail = `fernanda.e2e.${Date.now()}@teste.com`;

    await quickLogin(page, 'BDR');

    // ── Cria o negócio (sem nenhum contato vinculado) ──────────────────────
    await page.locator('.sidebar').locator('text=Pipeline').first().click();
    await page.waitForURL('**/pipeline');

    await page.click('text=Novo Negócio');
    await expect(page.locator('text=Novo Negócio —')).toBeVisible();
    await page.fill('input[placeholder="Ex: Renovação contrato 2026"]', dealName);
    await page.fill('input[placeholder="Razão social ou nome fantasia"]', dealCompany);
    await page.click('button:has-text("Criar Negócio")');
    await expect(page.locator('text=Novo Negócio —')).not.toBeVisible();

    // ── Abre o card ──────────────────────────────────────────────────────────
    const card = page.locator(`.kcard:has-text("${dealName}")`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator('.deal-panel')).toBeVisible();

    // ── Visão Geral: sem contato vinculado ──────────────────────────────────
    const panel = page.locator('.deal-panel');
    await expect(panel.locator('text=Nenhum contato vinculado')).toBeVisible();
    await expect(panel.locator('text=Vincular contato')).toBeVisible();

    // ── Email sem contato: "Para" vem vazio ─────────────────────────────────
    await panel.locator('#chk-e').click();
    const emailModal = page.locator('.modal', { hasText: 'Enviar Email' });
    await expect(emailModal).toBeVisible();
    const toField = emailModal.locator('input[type="email"]').first();
    await expect(toField).toHaveValue('');
    await emailModal.locator('.modal-hd .icon-btn').click();
    await expect(emailModal).not.toBeVisible();

    // ── Vincula um contato novo direto do card ──────────────────────────────
    await panel.locator('text=Vincular contato').click();
    await panel.locator('text=Novo contato').click();
    await panel.locator('input[placeholder="Nome *"]').fill(contactName);
    await panel.locator('input[placeholder="Email"]').fill(contactEmail);
    await panel.locator('button:has-text("Criar e vincular")').click();

    // Selector volta ao modo de visualização mostrando o contato vinculado
    await expect(panel.locator(`text=${contactName}`)).toBeVisible();
    await expect(panel.locator(`text=${contactEmail}`)).toBeVisible();
    await expect(panel.locator('text=Trocar')).toBeVisible();

    // ── Email após vínculo: "Para" vem preenchido automaticamente ───────────
    await panel.locator('#chk-e').click();
    await expect(emailModal).toBeVisible();
    await expect(toField).toHaveValue(contactEmail);
  });
});
