/**
 * session-auditoria.spec.ts — Fase 6.1/6.2 do PLANO_DESENHO_CRM.md
 * (slide 12: "Gerenciador de Login e Logoff do CRM").
 *
 * A auditoria já é alimentada pelo próprio login de CADA teste e2e do
 * projeto (via `logSessionEvent` chamado em `handleQuickLogin`) — o primeiro
 * teste aqui só confirma que esse rastro aparece na aba. Os demais cobrem
 * Fase 6.2 (reatribuir carteira) e a ação "Encerrar Sessão" do modal de
 * usuário, usando `sdr-002` (Mariana SDR) e `deal-031`, que nenhum outro
 * spec deste conjunto toca — de propósito, para não interferir em asserções
 * de outros arquivos que rodam contra o MESMO emulador compartilhado.
 *
 * `describe.serial`: a ordem importa — a reatribuição muta `deal-031` de
 * verdade, e o teste de auditoria final depende do "Encerrar Sessão" já ter
 * acontecido.
 */
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
}

async function abrirConfiguracoes(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Configurações', exact: true }).first().click();
  await page.waitForURL('**/settings');
}

test.describe.serial('Fase 6.1/6.2 — auditoria de sessão e reatribuição de carteira', () => {
  test('login do próprio teste já aparece na Auditoria de Sessão', async ({ page }) => {
    await login(page, 'Master');
    await abrirConfiguracoes(page);
    await page.getByRole('button', { name: '🔒 Auditoria de Sessão' }).click();

    const linha = page.locator('tr', { hasText: 'Ricardo Master' }).filter({ hasText: 'Login' });
    await expect(linha.first()).toBeVisible();
  });

  test('reatribuir carteira move o negócio aberto de Mariana para outro sdr', async ({ page }) => {
    await login(page, 'Master');
    await abrirConfiguracoes(page);
    await page.getByRole('button', { name: 'Equipe & Usuários', exact: true }).click();

    const linhaMariana = page.locator('tr', { hasText: 'Mariana SDR' });
    await linhaMariana.getByRole('button', { name: 'Mais opções para este usuário' }).click();

    const modal = page.locator('.modal', { hasText: 'Gerenciar Usuário: Mariana SDR' });
    await expect(modal.getByText(/negócio\(s\) em aberto atribuído\(s\) a este usuário\./)).toBeVisible();

    await modal.locator('select').filter({ hasText: 'Selecione o novo responsável' }).selectOption({ label: 'João SDR' });
    await modal.getByRole('button', { name: 'Reatribuir', exact: true }).click();

    await expect(modal.getByText('Carteira reatribuída.')).toBeVisible();
    await expect(modal.getByText('Nenhum negócio em aberto na carteira deste usuário.')).toBeVisible();
  });

  test('encerrar sessão derruba a sessão ATIVA de Mariana na hora, sem reload, e registra o evento "revoked"', async ({ page, browser }) => {
    // Sessão-alvo de verdade, num contexto de navegador isolado — Mariana não
    // tem atalho de quick-login, então entra pelo formulário manual. Isso é o
    // que faltava no teste anterior: sem uma segunda sessão ATIVA, o teste só
    // provava que a callable rodou, não que alguém logado de fato é expulso
    // (achado de QA manual: `revokeRefreshTokens` sozinho não derruba um ID
    // token já em cache — só o listener de `forceLogoutAt` em `useAuth.ts` faz
    // isso, e só um browser de verdade com sessão aberta prova que funciona).
    const marianaCtx = await browser.newContext();
    const marianaPage = await marianaCtx.newPage();
    await marianaPage.goto('/');
    await marianaPage.waitForURL('**/login');
    await marianaPage.getByPlaceholder('ex: joao@suaempresa.com.br').fill('sdr2@wizmart.com.br');
    await marianaPage.getByPlaceholder('Digite sua senha').fill('senha_de_teste_123');
    await marianaPage.getByRole('button', { name: 'Entrar no Sistema' }).click();
    await marianaPage.waitForURL(url => !url.pathname.endsWith('/login'));

    await login(page, 'Master');
    await abrirConfiguracoes(page);
    await page.getByRole('button', { name: 'Equipe & Usuários', exact: true }).click();

    const linhaMariana = page.locator('tr', { hasText: 'Mariana SDR' });
    await linhaMariana.getByRole('button', { name: 'Mais opções para este usuário' }).click();

    const modal = page.locator('.modal', { hasText: 'Gerenciar Usuário: Mariana SDR' });
    await modal.getByRole('button', { name: 'Encerrar Sessão', exact: true }).click();
    // Timeout generoso: o teste anterior acabou de disparar um writeBatch de 8
    // deals, e cada um aciona várias Cloud Functions em cascata (participants,
    // stage, won, timeline) — o emulador ainda pode estar drenando essa fila
    // quando esta chamada chega.
    await expect(modal.getByText('Sessão encerrada.')).toBeVisible({ timeout: 20_000 });
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();

    // Sem nenhuma ação nesta página — o listener ao vivo de `forceLogoutAt`
    // precisa empurrar o logout sozinho, só de a Cloud Function ter escrito.
    await marianaPage.waitForURL('**/login', { timeout: 20_000 });

    await page.getByRole('button', { name: '🔒 Auditoria de Sessão' }).click();
    const linha = page.locator('tr', { hasText: 'Mariana SDR' }).filter({ hasText: 'Encerrada (admin)' });
    await expect(linha.first()).toBeVisible();
    await expect(linha.first().getByText('por Ricardo Master')).toBeVisible();

    await marianaCtx.close();
  });

  // Achado de QA manual (teste B4 do roteiro): o backend já deixava manager
  // encerrar sessão de outro usuário (`assertCanEndSession`), mas a aba
  // Configurações inteira ficava invisível pra ele por padrão — sem
  // `view_admin_settings`, o botão nem existia na tela. Corrigido dando essa
  // permissão ao perfil Manager por padrão (`usePermissions.ts`); este teste
  // prova o caminho de UI de ponta a ponta, não só a regra.
  test('manager enxerga Configurações e encerra sessão de outro usuário pela UI', async ({ page }) => {
    await login(page, 'Manager');
    await abrirConfiguracoes(page);
    await page.getByRole('button', { name: 'Equipe & Usuários', exact: true }).click();

    const linhaLucas = page.locator('tr', { hasText: 'Lucas BDR' });
    await linhaLucas.getByRole('button', { name: 'Mais opções para este usuário' }).click();

    const modal = page.locator('.modal', { hasText: 'Gerenciar Usuário: Lucas BDR' });
    await modal.getByRole('button', { name: 'Encerrar Sessão', exact: true }).click();
    await expect(modal.getByText('Sessão encerrada.')).toBeVisible({ timeout: 20_000 });
    await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await page.getByRole('button', { name: '🔒 Auditoria de Sessão' }).click();
    const linha = page.locator('tr', { hasText: 'Lucas BDR' }).filter({ hasText: 'Encerrada (admin)' });
    await expect(linha.first()).toBeVisible();
    await expect(linha.first().getByText('por Fernanda Gestora')).toBeVisible();
  });
});
