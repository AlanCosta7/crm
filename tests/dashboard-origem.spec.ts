/**
 * dashboard-origem.spec.ts — Fase 4 do PLANO_DESENHO_CRM.md
 *
 * Slide 2 do deck "Desenho CRM":
 *   "Se eu passar mouse em cima, ele já me sinaliza a origem."
 *   "Se eu clicar, me mostra detalhes, como população, cidade e SDR que agendou."
 *
 * Os números vêm do seed (`scripts/seed/seed-emulators.mjs`), que muda com o tempo —
 * então em vez de fixar valores, o teste confere as INVARIANTES: o rótulo do
 * hover existe no formato do deck, a quebra soma o total, e o painel de detalhe
 * abre com os campos pedidos.
 *
 * ATENÇÃO à corrida: a assinatura do Firestore é assíncrona, e o dashboard
 * renderiza com zero antes dos deals chegarem. Sem `esperarDados`, as
 * asserções passam trivialmente contra 0 e o teste não prova nada — foi o que
 * aconteceu na primeira versão deste arquivo.
 */

import { test, expect } from '@playwright/test';

async function quickLogin(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.click(`text=${role}`);
  // Não espera por uma rota fixa: desde a Fase 2 o SDR pousa em /activities e
  // os outros papéis no Dashboard. Basta ter saído do login.
  await page.waitForURL(url => !url.pathname.endsWith('/login'));
}

/**
 * Espera os dados do Firestore chegarem.
 *
 * O seed garante deals em estágio de visita (2 `visita_agendada` +
 * 1 `degustacao_agendada`), então um total ainda em zero significa que a
 * assinatura não respondeu — não que não há visitas.
 */
async function esperarDados(page: import('@playwright/test').Page) {
  const card = page.locator('.kpi-dir-card', { hasText: 'Visitas Agendadas' }).first();
  await expect
    .poll(async () => Number((await card.getAttribute('title'))?.match(/^(\d+)/)?.[1] ?? 0),
      { message: 'dashboard continuou com 0 visitas — dados não carregaram' })
    .toBeGreaterThan(0);
}

/** Extrai os números de um rótulo "N Inbound / M Outbound[ / K sem origem]". */
function parseBreakdown(texto: string) {
  const m = texto.match(/(\d+)\s+Inbound\s*\/\s*(\d+)\s+Outbound(?:\s*\/\s*(\d+)\s+sem origem)?/);
  if (!m) throw new Error(`rótulo fora do formato do slide 2: ${JSON.stringify(texto)}`);
  return { inbound: +m[1], outbound: +m[2], unresolved: m[3] ? +m[3] : 0 };
}

test.describe('Fase 4 — quebra por origem nos indicadores', () => {
  test('o hover de Visitas Agendadas traz a quebra e ela soma o total', async ({ page }) => {
    await quickLogin(page, 'Master');
    await esperarDados(page);

    const card = page.locator('.kpi-dir-card', { hasText: 'Visitas Agendadas' }).first();
    const title = await card.getAttribute('title');
    expect(title).toMatch(/^\d+ Visitas — /);

    const b = parseBreakdown(title!);
    const total = Number(title!.match(/^(\d+) Visitas/)![1]);
    expect(b.inbound + b.outbound).toBe(total);
  });

  test('o hover de Reuniões Agendadas traz a quebra e ela soma o total', async ({ page }) => {
    await quickLogin(page, 'Master');
    await esperarDados(page);

    const card = page.locator('.kpi-dir-card', { hasText: 'Reuniões Agendadas' }).first();
    const title = await card.getAttribute('title');
    expect(title).toMatch(/^\d+ Reuniões — /);

    const b = parseBreakdown(title!);
    const total = Number(title!.match(/^(\d+) Reuniões/)![1]);
    // Reunião sem deal resolvido entra em "sem origem" — a soma tem que fechar
    // com o total, senão o número grande do widget estaria mentindo.
    expect(b.inbound + b.outbound + b.unresolved).toBe(total);
  });

  test('clicar em Visitas abre o painel com estado, cidade e quem agendou', async ({ page }) => {
    await quickLogin(page, 'Master');
    await esperarDados(page);

    await page.getByRole('button', { name: /Ver por estado/i }).click();
    const panel = page.locator('.card', { hasText: 'Visitas Agendadas — por estado e origem' });
    await expect(panel).toBeVisible();

    // O detalhe que o slide 2 pede aparece em pelo menos uma linha.
    await expect(panel.getByText(/agendou:/).first()).toBeVisible();
    // E o filtro de origem do painel está lá.
    await expect(panel.getByRole('button', { name: /^Inbound \(\d+\)$/ })).toBeVisible();
  });

  test('o filtro do painel de visitas reduz a lista para a origem escolhida', async ({ page }) => {
    await quickLogin(page, 'Master');
    await esperarDados(page);
    await page.getByRole('button', { name: /Ver por estado/i }).click();

    const panel = page.locator('.card', { hasText: 'Visitas Agendadas — por estado e origem' });
    const todas = await panel.getByRole('button', { name: /^Todas \(\d+\)$/ }).innerText();
    const totalTodas = Number(todas.match(/\((\d+)\)/)![1]);
    expect(totalTodas).toBeGreaterThan(0);

    // A lista aberta tem que ter exatamente o total do contador.
    await expect(panel.locator('.badge').filter({ hasText: /^(Inbound|Outbound|sem origem)$/ }))
      .toHaveCount(totalTodas);

    const outboundBtn = await panel.getByRole('button', { name: /^Outbound \(\d+\)$/ }).innerText();
    const totalOutbound = Number(outboundBtn.match(/\((\d+)\)/)![1]);
    await panel.getByRole('button', { name: /^Outbound \(\d+\)$/ }).click();

    // Só sobram linhas Outbound, na quantidade que o contador prometeu.
    await expect(panel.locator('.badge', { hasText: 'Outbound' })).toHaveCount(totalOutbound);
    await expect(panel.locator('.badge', { hasText: 'Inbound' })).toHaveCount(0);
  });

  test('abrir Reuniões fecha o painel de Visitas — um painel por vez', async ({ page }) => {
    await quickLogin(page, 'Master');
    await esperarDados(page);

    await page.getByRole('button', { name: /Ver por estado/i }).click();
    await expect(page.locator('.card', { hasText: 'Visitas Agendadas — por estado e origem' })).toBeVisible();

    await page.getByRole('button', { name: /Ver detalhes/i }).click();
    await expect(page.locator('.card', { hasText: 'Reuniões Agendadas — por origem' })).toBeVisible();
    await expect(page.locator('.card', { hasText: 'Visitas Agendadas — por estado e origem' })).toHaveCount(0);
  });

  test('o SDR vê o Fechamento do Dia com as próprias reuniões e visitas', async ({ page }) => {
    await quickLogin(page, 'SDR');

    // Desde a Fase 2 o SDR cai em /activities ao entrar (slide 9), então o
    // Fechamento do Dia — que vive no painel do SDR — exige ir ao Dashboard.
    await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).first().click();
    await page.waitForURL(/\/$/);

    const bloco = page.locator('.card', { hasText: 'Fechamento do Dia' });
    await expect(bloco).toBeVisible();
    await expect(bloco.getByText('Minhas Reuniões Agendadas')).toBeVisible();
    await expect(bloco.getByText('Minhas Visitas Agendadas')).toBeVisible();
    await expect(bloco.getByText('Minha Posição no Time')).toBeVisible();
    // A quebra por origem aparece nos dois indicadores.
    await expect(bloco.getByText(/\d+ Inbound \/ \d+ Outbound/).first()).toBeVisible();
  });
});
