/**
 * onDealStageChanged.ts — Cloud Function de transição de estágio v3
 *
 * Mudanças v3 vs v2:
 *  - Removida lógica de convergência Inbound→Hunter (funis unificados)
 *  - Ao entrar em "visita_agendada"   → grava cohortKeys.visitScheduledMonth
 *  - Ao entrar em "inaugurado"        → grava cohortKeys.conquestMonth + incrementa KPI conquistas
 *  - Ao entrar em "instalacao_agendada" → incrementa KPI instalações
 *  - Mantém premiação de moedas por coinsOnEnter
 *  - Bloqueia escrita se connectionType === 'standard_proposal' e destino é visita_*
 *
 * Fase 3 do PLANO_DESENHO_CRM.md (slide 8):
 *  - Ao entrar em etapa de AGENDAMENTO (reunião/visita/degustação) → quebra a
 *    cadência diária do card e instala a régua de agenda (follow-up 3/3 dias +
 *    confirmação 24h úteis antes).
 *  - Ao entrar na etapa de REALIZADO, em perda, ou ao voltar atrás → cancela a
 *    régua, para o SDR não seguir vendo "confirmar a reunião" depois dela.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { AGENDA_TRIGGER_STAGES } from "../cadence/agendaRuler";
import { applyAgendaRuler, cancelAgendaRuler } from "../cadence/applyAgendaRuler";
import { recordSdrEvent } from "../tv/sdrEvents";
import { awardPoints } from "../gamification/awardPoints";

function nowMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentCycle(): string {
  const d = new Date();
  return `Q${Math.ceil((d.getMonth() + 1) / 3)}-${d.getFullYear()}`;
}

export const onDealStageChanged = onDocumentUpdated(
  { document: "tenants/{tenantId}/deals/{dealId}", region: "southamerica-east1" },
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    // Ignora se o estágio não mudou
    if (before.stage === after.stage) return;

    const { tenantId, dealId } = event.params;
    const db = admin.firestore();
    const productId = after.productId || "wizmart";
    // responsibleId é mantido por onDealParticipantsChanged (sincronizado a cada
    // escrita do deal) — fallback ao cálculo inline só para a rara corrida em que
    // as duas CFs disparam no mesmo instante e essa ainda lê o valor pré-sync.
    const ownerId: string = after.responsibleId || after.assignedRepId || after.assignedSdrId || after.owner || "";
    const newStage: string = after.stage;

    // ── Busca o funil e o estágio de destino ────────────────────────────────
    const funnelId = after.funnelId as string | undefined;
    let targetStage: any = null;

    if (funnelId) {
      const funnelSnap = await db.doc(`tenants/${tenantId}/funnels/${funnelId}`).get();
      if (funnelSnap.exists) {
        const stages: any[] = funnelSnap.data()!.stages || [];
        targetStage = stages.find((s: any) => s.id === newStage);
      }
    }

    // ── Premiação de moedas por estágio ──────────────────────────────────────
    const coinsOnEnter: number = targetStage?.coinsOnEnter || 0;
    if (coinsOnEnter > 0 && ownerId) {
      try {
        await db.collection(`tenants/${tenantId}/coin_ledger`).add({
          userId: ownerId,
          productId,
          amount: coinsOnEnter,
          type: "stage_enter",
          dealId,
          note: `Entrou em "${targetStage?.name || newStage}"`,
          cycle: getCurrentCycle(),
          createdAt: FieldValue.serverTimestamp(),
          createdBy: "system",
        });
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao premiar moedas:", err);
      }
    }

    // ── Premiação de pontos por estágio (PLANO_DESENHO_CRM_2.md — pontuação
    // configurável) ────────────────────────────────────────────────────────
    // Irmão de coinsOnEnter: mesmo estágio, mesma tela de Configurações, moeda
    // diferente (pts do Ranking Geral de Pontos, não moedas da Loja). Ausente/0
    // = não pontua — todo estágio existente começa assim até o master mexer.
    const pointsOnEnter: number = targetStage?.pointsOnEnter || 0;
    if (pointsOnEnter > 0 && ownerId) {
      try {
        await awardPoints(db, admin.database(), tenantId, ownerId, pointsOnEnter);
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao premiar pontos:", err);
      }
    }

    // ── CohortKeys automáticos ────────────────────────────────────────────────
    // Toda escrita de cohortKeys acontece AQUI (server-side): as security rules
    // bloqueiam o cliente de escrevê-los, então o front nunca deve enviá-los.
    const cohortPatch: Record<string, any> = {};

    // WizMart: visita_agendada | Smart Café: conectado
    const isVisitStage = newStage === "visita_agendada" ||
      (newStage === "conectado" && productId === "smart_cafe");
    if (isVisitStage && !after.cohortKeys?.visitScheduledMonth) {
      cohortPatch["cohortKeys.visitScheduledMonth"] = nowMonth();
    }

    // BDR compartilhou o prospect com um SDR
    if (newStage === "prospeccao" && after.bdrId && after.assignedSdrId &&
        !after.cohortKeys?.prospectsSharedMonth) {
      cohortPatch["cohortKeys.prospectsSharedMonth"] = nowMonth();
    }

    const isWonStage = newStage === "inaugurado" || newStage === "instalacao_realizada";
    if (isWonStage) {
      if (!after.cohortKeys?.conquestMonth) {
        cohortPatch["cohortKeys.conquestMonth"] = nowMonth();
      }
      cohortPatch["status"] = "won";
      cohortPatch["updatedAt"] = FieldValue.serverTimestamp();
    }

    if (Object.keys(cohortPatch).length > 0) {
      try {
        await event.data!.after.ref.update(cohortPatch);
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao gravar cohortKeys:", err);
      }
    }

    // ── Eventos do SDR para o Ranking da TV (PLANO_DESENHO_CRM_2.md) ─────────
    // Um evento por passagem de etapa (reunião agendada/realizada, visita
    // agendada). Antes do bloco de RTDB abaixo, pelo mesmo motivo da régua.
    try {
      await recordSdrEvent(db, tenantId, {
        id: dealId,
        stage: newStage,
        assignedSdrId: after.assignedSdrId,
        productId,
      });
    } catch (err) {
      console.error("[onDealStageChanged] Erro ao gravar evento do SDR:", err);
    }

    // ── Régua de agenda (Fase 3 — slide 8) ───────────────────────────────────
    //
    // POSIÇÃO DELIBERADA: antes das escritas no Realtime Database. A régua é o
    // que alimenta a fila de trabalho do SDR; o bloco de RTDB abaixo só atualiza
    // contadores da TV. Uma `transaction()` no RTDB não LANÇA quando o banco está
    // inalcançável — ela fica tentando, e o `try/catch` em volta nunca dispara.
    // Com a régua depois dela, uma lentidão no RTDB faria o SDR ficar sem régua
    // em silêncio. O teste de emulador expôs exatamente isso no caminho da visita
    // (o único que incrementa `visitsScheduled`).
    const motivoAgenda = AGENDA_TRIGGER_STAGES[newStage];
    const motivoAnterior = AGENDA_TRIGGER_STAGES[before.stage];

    if (motivoAgenda) {
      try {
        const r = await applyAgendaRuler(db, tenantId, dealId, after, motivoAgenda);
        console.log(
          `[onDealStageChanged] régua de agenda em ${dealId}: ` +
          `${r.canceladasDaCadencia} da cadência e ${r.canceladasDaAgenda} da agenda canceladas, ` +
          `${r.criadas} criada(s)` + (r.motivoSemRegua ? ` (sem régua: ${r.motivoSemRegua})` : ""),
        );
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao instalar a régua de agenda:", err);
      }
    } else if (motivoAnterior) {
      // Saiu de uma etapa de agendamento — compromisso feito, lead perdido ou
      // card movido de volta. Em qualquer um dos casos a régua perdeu sentido.
      try {
        const n = await cancelAgendaRuler(db, tenantId, dealId, `saiu_de_${before.stage}`);
        if (n > 0) {
          console.log(`[onDealStageChanged] régua de agenda de ${dealId} cancelada (${n} tarefa(s)).`);
        }
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao cancelar a régua de agenda:", err);
      }
    }

    // ── KPI Realtime Database — increments ───────────────────────────────────
    try {
      const rtdb = admin.database();
      const kpiRef = rtdb.ref(`tenants/${tenantId}/live_kpis`);

      if (isWonStage) {
        const conquestValue: number = after.conquestValue || 1;
        if (productId === "wizmart") {
          await kpiRef.child("conquestsWizmart").transaction((cur: number | null) => (cur || 0) + conquestValue);
        } else {
          await kpiRef.child("conquestsSmartCafe").transaction((cur: number | null) => (cur || 0) + conquestValue);
        }
      }

      if (newStage === "instalacao_agendada") {
        await kpiRef.child("installations").transaction((cur: number | null) => (cur || 0) + 1);
      }

      if (newStage === "visita_agendada") {
        await kpiRef.child("visitsScheduled").transaction((cur: number | null) => (cur || 0) + 1);
        // Visitas por estado
        const uf: string = after.location?.state || "";
        if (uf) {
          await kpiRef.child(`visitsScheduledByState/${uf}`).transaction((cur: number | null) => (cur || 0) + 1);
        }
      }
    } catch (err) {
      console.error("[onDealStageChanged] Erro ao atualizar RTDB:", err);
    }

    // ── Projeto: timeline event ───────────────────────────────────────────────
    if (isWonStage || newStage === "instalacao_agendada") {
      try {
        await db.collection(`tenants/${tenantId}/activities`).add({
          type: "win",
          productId,
          userId: ownerId || "system",
          dealId,
          text: newStage === "inaugurado"
            ? `🏆 Deal inaugurado — conquista registrada (${after.conquestValue || 1} PDV)`
            : newStage === "instalacao_realizada"
            ? `🏆 Instalação realizada — conquista registrada (${after.conquestValue || 1} PDV)`
            : `📦 Instalação agendada`,
          status: "completed",
          coinsAwarded: 0,
          wasOnTime: true,
          cadenceType: "manual",
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("[onDealStageChanged] Erro ao gravar atividade:", err);
      }
    }

    console.log(`[onDealStageChanged] Deal ${dealId}: ${before.stage} → ${newStage} (produto: ${productId})`);
  }
);
