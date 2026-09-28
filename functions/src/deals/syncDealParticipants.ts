/**
 * syncDealParticipants.ts — mantém as "assinaturas atuais" do card sincronizadas
 *
 * Fase A do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md (raiz do repo `CRM/`).
 *
 * `participantIds` é um ESPELHO VIVO de [owner, bdrId, assignedSdrId, assignedRepId]
 * (sem duplicatas) — não um histórico acumulado. Isso é proposital: quando um Rep
 * recusa um handoff (`declineHandoff` já zera `assignedRepId`) ou um lead perdido
 * é devolvido ao BDR (`requeuedForBdr` já zera `assignedSdrId`), a pessoa
 * substituída sai daqui automaticamente — sem lógica extra — porque o campo de
 * origem já foi limpo antes desta função rodar. O rastreio de quem foi
 * substituído e por quê fica em `deal_timeline` (Fase C), não neste campo.
 *
 * `responsibleId` resolve o "dono atual" uma única vez no servidor
 * (assignedRepId || assignedSdrId || bdrId || owner), substituindo a lógica
 * hoje duplicada no client (`PipelinePage.tsx`) e em `onDealStageChanged.ts`.
 *
 * `origin` ('inbound' | 'outbound') entrou na Fase 1.3 do PLANO_DESENHO_CRM.md:
 * o deck pede um board único por produto, com a origem virando atributo do card
 * em vez de funil separado. A regra de decisão está em `./dealOrigin.ts`; mora
 * aqui, e não numa function própria, porque esta é a CF dos CAMPOS DERIVADOS do
 * deal — um trigger a mais no mesmo documento seria uma invocação a mais por
 * escrita, sem ganho nenhum.
 *
 * Roda em CREATE e UPDATE (onDocumentWritten, não só quando o estágio muda —
 * diferente de `onDealStageChanged`) porque uma atribuição manual do BDR ou
 * uma revisão de porte não necessariamente move o card de estágio.
 * Idempotente: se os campos já estão corretos, não escreve nada — isso é o
 * que impede um loop infinito de re-disparo pela própria escrita.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { computeOrigin } from "./dealOrigin";

function computeParticipantIds(data: FirebaseFirestore.DocumentData): string[] {
  const raw = [data.owner, data.bdrId, data.assignedSdrId, data.assignedRepId];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

function computeResponsibleId(data: FirebaseFirestore.DocumentData): string {
  return data.assignedRepId || data.assignedSdrId || data.bdrId || data.owner || "";
}

function sameParticipantIds(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export const onDealParticipantsChanged = onDocumentWritten(
  { document: "tenants/{tenantId}/deals/{dealId}", region: "southamerica-east1" },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return; // documento deletado — nada a sincronizar

    const data = after.data()!;
    const participantIds = computeParticipantIds(data);
    const responsibleId = computeResponsibleId(data);
    const origin = computeOrigin(data);

    const participantsUnchanged = sameParticipantIds(data.participantIds, participantIds);
    const responsibleUnchanged = (data.responsibleId || "") === responsibleId;
    const originUnchanged = data.origin === origin;
    if (participantsUnchanged && responsibleUnchanged && originUnchanged) return;

    try {
      await after.ref.update({ participantIds, responsibleId, origin });
    } catch (err) {
      console.error("[onDealParticipantsChanged] Erro ao sincronizar campos derivados:", err);
    }
  }
);
