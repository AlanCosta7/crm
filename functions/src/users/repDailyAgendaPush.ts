/**
 * repDailyAgendaPush.ts — resumo da manhã para o Rep App (Fase 4,
 * PLANO_PWA_REPRESENTANTES.md §8).
 *
 * Todo dia às 7h BRT, para cada `rep` com token FCM registrado (Perfil do
 * Rep App → "Ativar notificações"), conta quantas visitas têm
 * `visitScheduledAt` HOJE entre os deals onde ele participa
 * (`participantIds array-contains uid` — mesmo campo que a security rule de
 * `deals` exige, ver `dealQueryScope.ts` e a nota técnica em
 * PLANO_PWA_REPRESENTANTES.md §3.1) e, se houver pelo menos uma, dispara um
 * push "Você tem N visitas hoje".
 *
 * A contagem em si (`countTodaysScheduledVisits`) é pura — sem Firestore nem
 * Admin SDK — para poder testar sem emulador (mesmo padrão de
 * `janitorNoteAttachments.ts`/`isOrphanPrefix`).
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

const REGION = "southamerica-east1";
// TODO: quando existir mais de um tenant, iterar sobre `tenants/*` em vez de
// um id fixo — hoje só há um tenant em produção (wizmart_sp).
const TENANT_ID = "wizmart_sp";

interface DealLike {
  id: string;
  visitScheduledAt?: unknown;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Quantos deals têm `visitScheduledAt` no dia de `now` (limites [00:00, 24:00)). */
export function countTodaysScheduledVisits(deals: DealLike[], now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return deals.filter((d) => {
    const visit = toDate(d.visitScheduledAt);
    return visit !== null && visit >= start && visit < end;
  }).length;
}

export function buildAgendaPushMessage(count: number): { title: string; body: string } {
  return {
    title: "Sua agenda de hoje",
    body: `Você tem ${count} visita${count > 1 ? "s" : ""} agendada${count > 1 ? "s" : ""} para hoje.`,
  };
}

/** Códigos de erro do FCM que significam "este token nunca mais vai funcionar" — vale limpar. */
const DEAD_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export const sendRepDailyAgendaPush = onSchedule(
  {
    schedule: "0 7 * * *", // todo dia, 7h BRT
    timeZone: "America/Sao_Paulo",
    retryCount: 1,
    timeoutSeconds: 300,
    region: REGION,
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    const repsSnap = await db
      .collection(`tenants/${TENANT_ID}/users`)
      .where("role", "==", "rep")
      .get();

    for (const repDoc of repsSnap.docs) {
      const tokens: string[] = repDoc.data().fcmTokens ?? [];
      if (tokens.length === 0) continue;

      const dealsSnap = await db
        .collection(`tenants/${TENANT_ID}/deals`)
        .where("participantIds", "array-contains", repDoc.id)
        .get();
      const deals: DealLike[] = dealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const count = countTodaysScheduledVisits(deals, now);
      if (count === 0) continue;

      const { title, body } = buildAgendaPushMessage(count);

      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: { url: "/" },
        });

        const deadTokens = response.responses
          .map((r, i) => (!r.success && DEAD_TOKEN_ERROR_CODES.has(r.error?.code ?? "") ? tokens[i] : null))
          .filter((t): t is string => t !== null);

        if (deadTokens.length > 0) {
          await repDoc.ref.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
          });
        }

        console.log(`[sendRepDailyAgendaPush] ${repDoc.id}: ${count} visita(s), ${response.successCount}/${tokens.length} push(es) entregues`);
      } catch (err) {
        // Um rep sem push funcionando não deve travar o resumo dos outros.
        console.error(`[sendRepDailyAgendaPush] falha ao enviar para ${repDoc.id}:`, err);
      }
    }
  }
);
