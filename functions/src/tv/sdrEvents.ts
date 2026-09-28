/**
 * sdrEvents.ts — eventos de produtividade do SDR (base do Ranking na TV)
 *
 * O ranking do cliente conta MOVIMENTOS no período ("visitas agendadas na
 * semana", "reuniões realizadas hoje"), e o deal só guarda a etapa ATUAL — quem
 * já passou por "Visita Agendada" e seguiu adiante não teria como ser contado
 * depois. Por isso `onDealStageChanged` grava um evento por passagem de etapa,
 * em `tenants/{tid}/sdr_events`, e o `tvHelper` agrega por período.
 *
 * Um evento por (deal, tipo): o id é determinístico, então voltar o card e
 * reagendar não conta duas vezes a mesma visita — mesma regra dos `cohortKeys`
 * (`!after.cohortKeys?.visitScheduledMonth`).
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { SdrEventKind } from "./rankingSdr";

const KIND_BY_STAGE: Record<string, SdrEventKind> = {
  reuniao_agendada: "meeting_scheduled",
  reuniao_realizada: "meeting_done",
  visita_agendada: "visit_scheduled",
  degustacao_agendada: "visit_scheduled", // visita do Smart Café
};

export function sdrEventKindForStage(stage: string): SdrEventKind | null {
  return KIND_BY_STAGE[stage] ?? null;
}

/** Devolve true se gravou; false se já existia (ou não há SDR/etapa relevante). */
export async function recordSdrEvent(
  db: Firestore,
  tenantId: string,
  deal: { id: string; stage: string; assignedSdrId?: string; productId?: string },
): Promise<boolean> {
  const kind = sdrEventKindForStage(deal.stage);
  if (!kind || !deal.assignedSdrId) return false;

  const ref = db.doc(`tenants/${tenantId}/sdr_events/${deal.id}__${kind}`);
  try {
    await ref.create({
      sdrId: deal.assignedSdrId,
      dealId: deal.id,
      kind,
      productId: deal.productId || "wizmart",
      at: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err: any) {
    // 6 = ALREADY_EXISTS: o card já passou por esta etapa antes.
    if (err?.code === 6 || /already exists/i.test(err?.message ?? "")) return false;
    throw err;
  }
}
