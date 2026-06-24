import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { refreshTvSnapshot } from "./tvHelper";

/**
 * Cloud Function que reage à criação, modificação ou exclusão de links de TV Display.
 * Sincroniza em tempo real o snapshot dos KPIs e classificação no RTDB `/public_tv/{token}`.
 */
export const onTokenChange = onDocumentWritten(
  "tenants/{tenantId}/tv_links/{linkId}",
  async (event) => {
    const change = event.data;
    if (!change) return;

    const { tenantId, linkId } = event.params;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    const rtdb = admin.database();

    // 1. Caso de exclusão ou inativação: Deleta o token no RTDB e corta a conexão da TV
    if (!afterData || afterData.active === false) {
      const tokenToDelete = beforeData?.token || afterData?.token;
      if (tokenToDelete) {
        await rtdb.ref(`public_tv/${tokenToDelete}`).remove();
        console.log(`[onTokenChange] Token de TV revogado e excluído do RTDB: ${tokenToDelete}`);
      }
      return;
    }

    // 2. Caso de criação ou modificação ativa: Usa o helper compartilhado para consolidar os dados
    try {
      await refreshTvSnapshot(tenantId, linkId, afterData);
    } catch (err) {
      console.error(`[onTokenChange] Falha ao atualizar TV para linkId=${linkId}:`, err);
    }
  }
);

export default onTokenChange;
