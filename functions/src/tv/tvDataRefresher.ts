import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { refreshTvSnapshot } from "./tvHelper";
import { listActiveTenantIds } from "../shared/tenants";

/**
 * Cloud Function agendada que roda a cada 5 minutos.
 * Varre todos os displays de TV ativos no Firestore de cada tenant
 * e atualiza seus snapshots no Realtime Database (/public_tv/{token}).
 */
export const tvDataRefresher = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: "America/Sao_Paulo",
    memory: "256MiB",
    region: "southamerica-east1",
  },
  async () => {
    const db = admin.firestore();
    // Ver functions/src/shared/tenants.ts — não existe documento em
    // tenants/{tenantId}, só subcoleções.
    const tenantIds = await listActiveTenantIds(db);

    for (const tenantId of tenantIds) {
      try {
        console.log(`[tvDataRefresher] Atualizando TVs para tenant: ${tenantId}`);
        
        // Busca todos os links de TV ativos para o tenant
        const tvLinksSnap = await db
          .collection(`tenants/${tenantId}/tv_links`)
          .where("active", "==", true)
          .get();

        for (const tvLinkDoc of tvLinksSnap.docs) {
          const linkId = tvLinkDoc.id;
          const linkData = tvLinkDoc.data();
          try {
            await refreshTvSnapshot(tenantId, linkId, linkData);
          } catch (linkErr) {
            console.error(`[tvDataRefresher] Erro no link ${linkId} do tenant ${tenantId}:`, linkErr);
          }
        }
      } catch (err) {
        console.error(`[tvDataRefresher] Erro ao processar tenant ${tenantId}:`, err);
      }
    }
  }
);

export default tvDataRefresher;
