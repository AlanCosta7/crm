/**
 * tenants.ts — descoberta de tenants ativos para os crons que varrem "todo mundo"
 *
 * BUG REAL, achado em QA manual (13/09/2026): todo cron que precisa processar
 * cada tenant fazia `db.collection("tenants").get()` — mas em NENHUM lugar do
 * código (seed, `inviteUser`, ou qualquer outro fluxo) um documento em
 * `tenants/{tenantId}` chega a ser gravado; só as subcoleções
 * (`tenants/{tenantId}/users`, `/deals`, `/settings`...) existem. No modelo do
 * Firestore, um documento pai nunca escrito NÃO aparece numa query na coleção
 * — ele "existe" apenas implicitamente, por ter subcoleções com dado. Ou
 * seja: `dailyCadenceEngine`, `kpiAggregator`, `tvDataRefresher`,
 * `commissionEvaluationQueue`, `contractReminderEmail` e `repSlaChecker`
 * rodavam todo dia sem processar tenant NENHUM — sem lançar erro, sem log de
 * falha, porque tecnicamente "não havia tenant pra processar".
 *
 * Corrigido descobrindo tenants por uma COLLECTION GROUP QUERY em `users` —
 * toda conta de verdade tem pelo menos um usuário, e o pai da subcoleção
 * `users` é sempre o documento do tenant (`tenants/{tenantId}/users/{uid}`),
 * então não depende de nenhum documento pai ter sido escrito.
 */
import type { Firestore } from "firebase-admin/firestore";

export async function listActiveTenantIds(db: Firestore): Promise<string[]> {
  const snap = await db.collectionGroup("users").get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const tenantRef = doc.ref.parent.parent; // tenants/{tenantId}/users/{uid} → tenants/{tenantId}
    if (tenantRef) ids.add(tenantRef.id);
  }
  return Array.from(ids);
}
