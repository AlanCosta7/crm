/**
 * test-agenda-ruler-emulator.mjs — Valida a Fase 3 do PLANO_DESENHO_CRM.md.
 *
 * Slide 8 do deck: quando o cliente marca reunião ou visita, a cadência é
 * quebrada e outra régua começa — follow-up de 3 em 3 dias + confirmação 24h
 * úteis antes.
 *
 * Cenários:
 *  1. Card entra em "Reunião Agendada" → cadência pendente é cancelada.
 *  2. A régua nova nasce com follow-ups de 3/3 dias + 1 confirmação.
 *  3. As tarefas caem no bloco "Follow Up de Agenda" das 16h (Fase 2), com o
 *     tipo próprio `agenda` — e NENHUMA é contada como reunião.
 *  4. A confirmação fica 24h úteis antes, pulando o fim de semana.
 *  5. Visita agendada gera régua de agenda com motivo de visita.
 *  6. Remarcar o compromisso substitui a régua, sem acumular.
 *  7. Compromisso sem data não gera régua (mas quebra a cadência).
 *  8. "Reunião Realizada" cancela a régua pendente.
 *  9. Lead perdido cancela a régua pendente.
 *
 * Uso: npm run test:agenda
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-wizmart-crm-local';
const TENANT = 'wizmart';

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

let allOk = true;
function report(ok, label, detalhe = '') {
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '🔴'} ${label}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function esperar(pred, timeoutMs = 25000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const r = await pred();
    if (r) return r;
    await new Promise(res => setTimeout(res, 400));
  }
  return null;
}

const atividadesDo = async (dealId, filtro = {}) => {
  const snap = await db.collection(`tenants/${TENANT}/activities`).where('dealId', '==', dealId).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(a => Object.entries(filtro).every(([k, v]) => a[k] === v));
};

const BASE_DEAL = {
  name: 'Deal Agenda', company: 'Empresa Agenda', value: 0,
  productId: 'wizmart', funnelId: 'wizmart', funnelType: 'main',
  owner: 'sdr-1', assignedSdrId: 'sdr-1', status: 'open', due: '—',
  tasks: { e: false, w: false, m: false },
};

/** Cria o deal em `conectado` com 3 atividades de cadência pendentes. */
async function criarComCadencia(id, extra = {}) {
  const ref = db.doc(`tenants/${TENANT}/deals/${id}`);
  await ref.set({ ...BASE_DEAL, stage: 'conectado', ...extra, createdAt: new Date(), updatedAt: new Date() });
  for (const type of ['call', 'email', 'linkedin']) {
    await db.collection(`tenants/${TENANT}/activities`).add({
      dealId: id, userId: 'sdr-1', type, cadenceType: 'sdr_daily',
      status: 'pending', coinsAwarded: 0, createdAt: new Date(),
    });
  }
  await new Promise(r => setTimeout(r, 1200));
  return ref;
}

// Compromisso numa SEGUNDA, ~3 semanas à frente: garante fim de semana entre a
// confirmação e o compromisso, e espaço para vários follow-ups.
function proximaSegunda(semanas = 3) {
  const d = new Date();
  d.setDate(d.getDate() + semanas * 7);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

// ── 1 e 2. Reunião agendada quebra a cadência e instala a régua ──────────────
const evento = proximaSegunda();
const d1 = await criarComCadencia('agenda-reuniao', { meetingScheduledAt: evento });
await d1.update({ stage: 'reuniao_agendada', updatedAt: new Date() });

const regua = await esperar(async () => {
  const a = await atividadesDo('agenda-reuniao', { cadenceType: 'agenda', status: 'pending' });
  return a.length > 0 ? a : null;
});
report(!!regua, 'régua de agenda é criada ao entrar em Reunião Agendada',
  regua ? `${regua.length} tarefa(s)` : 'nenhuma tarefa criada');

const canceladas = await atividadesDo('agenda-reuniao', { cadenceType: 'sdr_daily', status: 'skipped' });
report(canceladas.length === 3, 'as 3 atividades da cadência diária são canceladas',
  `${canceladas.length}/3 · motivo=${canceladas[0]?.skippedReason}`);
report(canceladas.every(a => a.skippedReason === 'agenda_iniciada'),
  'canceladas com o motivo registrado (auditoria da jornada)');

const confirmacoes = (regua ?? []).filter(a => a.agendaKind === 'confirmation');
const followups = (regua ?? []).filter(a => a.agendaKind === 'followup');
report(confirmacoes.length === 1, 'exatamente uma confirmação', `${confirmacoes.length}`);
report(followups.length >= 4, 'vários follow-ups antes dela', `${followups.length}`);

const ordenados = followups.map(a => a.dueAt.toDate().getTime()).sort((a, b) => a - b);
const gaps = ordenados.slice(1).map((t, i) => Math.round((t - ordenados[i]) / 86400000));
report(gaps.length > 0 && gaps.every(g => g === 3), 'follow-ups de 3 em 3 dias (slide 8)',
  `intervalos: ${gaps.join(',')}`);

// ── 3. Caem no bloco das 16h (Fase 2) ────────────────────────────────────────
report((regua ?? []).every(a => a.blockId === 'follow_up' && a.type === 'agenda' && a.agendaReason === 'meeting_scheduled'),
  "tarefas caem no bloco 'Follow Up de Agenda' das 16h, com type 'agenda'",
  `blockId=${regua?.[0]?.blockId} type=${regua?.[0]?.type} motivo=${regua?.[0]?.agendaReason}`);

// Follow-up de reunião não é reunião: todo indicador de "Reuniões Agendadas"
// conta atividades `meeting`, e a régua não pode inflar esse número.
const contadasComoReuniao = await atividadesDo('agenda-reuniao', { type: 'meeting' });
report(contadasComoReuniao.length === 0,
  'nenhuma tarefa da régua é contada como reunião (type meeting)',
  `${contadasComoReuniao.length} atividade(s) meeting`);

// ── 4. Confirmação 24h úteis antes, pulando o fim de semana ──────────────────
const confirmAt = confirmacoes[0]?.dueAt?.toDate();
const diasAntes = confirmAt ? Math.round((evento.getTime() - confirmAt.getTime()) / 86400000) : -1;
report(!!confirmAt && confirmAt.getDay() === 5,
  'confirmação de compromisso na segunda cai na SEXTA (24h úteis)',
  confirmAt ? `dia da semana=${confirmAt.getDay()} (5=sex), ${diasAntes} dias corridos antes` : 'sem confirmação');

// ── 5. Visita gera régua de visita ───────────────────────────────────────────
const d2 = await criarComCadencia('agenda-visita', { visitScheduledAt: proximaSegunda(3) });
await d2.update({ stage: 'visita_agendada', updatedAt: new Date() });
const reguaVisita = await esperar(async () => {
  const a = await atividadesDo('agenda-visita', { cadenceType: 'agenda', status: 'pending' });
  return a.length > 0 ? a : null;
});
report(!!reguaVisita && reguaVisita.every(a => a.type === 'agenda' && a.agendaReason === 'visit_scheduled'),
  "visita agendada gera régua de agenda com motivo 'visita'",
  reguaVisita ? `${reguaVisita.length} tarefa(s) type=${reguaVisita[0].type} motivo=${reguaVisita[0].agendaReason}` : 'nenhuma');

// ── 6. Remarcar substitui a régua ────────────────────────────────────────────
const antesDoRemarque = (await atividadesDo('agenda-reuniao', { cadenceType: 'agenda', status: 'pending' })).length;
await d1.update({ stage: 'conectado', updatedAt: new Date() });
await new Promise(r => setTimeout(r, 1500));
await d1.update({ meetingScheduledAt: proximaSegunda(5), stage: 'reuniao_agendada', updatedAt: new Date() });

const depoisDoRemarque = await esperar(async () => {
  const a = await atividadesDo('agenda-reuniao', { cadenceType: 'agenda', status: 'pending' });
  return a.length > 0 && a.length !== antesDoRemarque ? a : null;
}) ?? await atividadesDo('agenda-reuniao', { cadenceType: 'agenda', status: 'pending' });

const canceladasNoRemarque = await atividadesDo('agenda-reuniao', { cadenceType: 'agenda', status: 'skipped' });
report(canceladasNoRemarque.length > 0,
  'remarcar cancela a régua anterior em vez de acumular',
  `${canceladasNoRemarque.length} cancelada(s), ${depoisDoRemarque.length} pendente(s)`);
report(depoisDoRemarque.filter(a => a.agendaKind === 'confirmation').length === 1,
  'e continua com exatamente uma confirmação');

// ── 7. Sem data não gera régua, mas quebra a cadência ────────────────────────
const d3 = await criarComCadencia('agenda-sem-data');
await d3.update({ stage: 'reuniao_agendada', updatedAt: new Date() });
await new Promise(r => setTimeout(r, 2500));
const semData = await atividadesDo('agenda-sem-data', { cadenceType: 'agenda' });
const cadenciaQuebrada = await atividadesDo('agenda-sem-data', { cadenceType: 'sdr_daily', status: 'skipped' });
report(semData.length === 0 && cadenciaQuebrada.length === 3,
  'sem data: nenhuma régua criada, mas a cadência é quebrada',
  `régua=${semData.length} canceladas=${cadenciaQuebrada.length}`);

// ── 8. Realizado cancela a régua ─────────────────────────────────────────────
await d2.update({ stage: 'visita_realizada', updatedAt: new Date() });
const zeradaPorRealizado = await esperar(async () => {
  const a = await atividadesDo('agenda-visita', { cadenceType: 'agenda', status: 'pending' });
  return a.length === 0 ? true : null;
});
report(!!zeradaPorRealizado, 'entrar em Visita Realizada cancela a régua pendente');

// ── 9. Perda cancela a régua ─────────────────────────────────────────────────
const d4 = await criarComCadencia('agenda-perdido', { meetingScheduledAt: proximaSegunda(3) });
await d4.update({ stage: 'reuniao_agendada', updatedAt: new Date() });
await esperar(async () => {
  const a = await atividadesDo('agenda-perdido', { cadenceType: 'agenda', status: 'pending' });
  return a.length > 0 ? a : null;
});
await d4.update({ stage: 'perdeu', status: 'lost', updatedAt: new Date() });
const zeradaPorPerda = await esperar(async () => {
  const a = await atividadesDo('agenda-perdido', { cadenceType: 'agenda', status: 'pending' });
  return a.length === 0 ? true : null;
});
report(!!zeradaPorPerda, 'lead perdido cancela a régua pendente');

console.log(allOk ? '\n🎉 Fase 3 validada no emulador' : '\n💥 há cenários falhando');
process.exit(allOk ? 0 : 1);
