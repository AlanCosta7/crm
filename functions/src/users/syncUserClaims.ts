/**
 * syncUserClaims.ts — mantém o token do usuário fiel ao documento dele
 *
 * Fase 0 do PLANO_DESENHO_CRM.md (raiz do repo `CRM/`).
 *
 * O PROBLEMA que esta função resolve: a autorização real do CRM vive nas custom
 * claims do token (`useAuth.ts` lê `role`/`tenantId`/`productIds` de lá, e todas
 * as `firestore.rules` checam `request.auth.token.*`), mas as claims eram
 * gravadas UMA ÚNICA VEZ, no `inviteUser`. A tela de administração grava papel,
 * produtos e `isActive` no documento — e nada propagava isso para o token.
 * Resultado: promover, rebaixar ou bloquear um usuário não tinha efeito nenhum.
 *
 * O que ela faz, a cada escrita em `users/{uid}`:
 *  1. Compara as claims desejadas (do documento) com as claims atuais (do Auth).
 *  2. Se divergirem, regrava as claims e revoga os refresh tokens — o usuário
 *     recebe o papel novo no próximo login, sem depender de logout manual.
 *  3. Espelha `isActive` em `auth.updateUser({ disabled })`: bloqueado no
 *     documento = bloqueado no Firebase Auth. O documento e todo o histórico
 *     continuam intactos (requisito do slide 12: "inativar sem excluir, para
 *     continuar acessando as informações dele e atribuir a outro").
 *
 * IDEMPOTÊNCIA É REQUISITO, NÃO ELEGÂNCIA: `users/{uid}` é escrito a toda hora
 * por caminhos que não têm nada a ver com permissão (`onCoinTransactionCreated`
 * atualiza `coinBalance`, o motor de cadência atualiza `last`...). Sem o
 * short-circuit do passo 1, cada moeda ganha revogaria a sessão do usuário.
 *
 * GUARDA DO ÚLTIMO MASTER: rebaixar ou bloquear o único master ativo deixaria o
 * tenant sem ninguém capaz de administrar (nem de desfazer). Nesse caso a função
 * RESTAURA o documento e não toca nas claims. A restauração re-dispara o trigger
 * uma vez, e aí documento e claims já concordam — converge e para.
 *
 * LIMITE CONHECIDO: `revokeRefreshTokens` corta o refresh, mas um ID token já
 * emitido segue criptograficamente válido até expirar (≤1h) — as rules do
 * Firestore não checam revogação. Ou seja: o bloqueio impede novo login na hora
 * e fecha a sessão em até 1 hora. Fechar a janela exigiria um `get()` no
 * documento do usuário dentro das rules, a cada operação (custo por leitura) —
 * decisão pendente com o Alan, registrada no PLANO_DESENHO_CRM.md.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { claimsMatch, derrubaUltimoMaster, desiredClaims } from "./userClaimsRules";

const REGION = "southamerica-east1";

/**
 * Conta os masters ativos do tenant DESCONSIDERANDO o usuário sob análise —
 * o documento dele já está gravado com o valor novo, então incluí-lo daria a
 * resposta errada justamente no caso que a guarda existe para pegar.
 */
async function contarOutrosMastersAtivos(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  uidIgnorado: string,
): Promise<number> {
  const snap = await db.collection(`tenants/${tenantId}/users`).where("role", "==", "master").get();
  return snap.docs.filter(d => d.id !== uidIgnorado && d.data().isActive !== false).length;
}

export const onUserProfileWritten = onDocumentWritten(
  { document: "tenants/{tenantId}/users/{uid}", region: REGION },
  async (event) => {
    const { tenantId, uid } = event.params;
    const after = event.data?.after;

    // Documento removido: o acesso é revogado no caminho de exclusão do usuário,
    // não aqui — sem documento não há papel a sincronizar.
    if (!after?.exists) return;

    const data = after.data()!;
    const before = event.data?.before?.exists ? event.data.before.data()! : null;

    const desired = desiredClaims(tenantId, data);
    const shouldBeDisabled = data.isActive === false;

    const auth = admin.auth();
    const db = admin.firestore();

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.getUser(uid);
    } catch (err: unknown) {
      // Perfil sem conta no Auth (seed parcial, doc criado à mão) — nada a sincronizar.
      if ((err as { code?: string })?.code === "auth/user-not-found") {
        console.warn(`[onUserProfileWritten] ${uid}: perfil sem conta no Auth — ignorado.`);
        return;
      }
      throw err;
    }

    const claimsOk = claimsMatch(userRecord.customClaims, desired);
    const disabledOk = userRecord.disabled === shouldBeDisabled;
    if (claimsOk && disabledOk) return; // nada de permissão mudou — o caso comum

    // ── Guarda do último master ────────────────────────────────────────────────
    const podeDerrubarMaster = before?.role === "master"
      && (desired.role !== "master" || shouldBeDisabled);
    if (podeDerrubarMaster) {
      const outrosMastersAtivos = await contarOutrosMastersAtivos(db, tenantId, uid);
      const derruba = derrubaUltimoMaster({
        antes: before,
        papelDepois: desired.role,
        bloqueadoDepois: shouldBeDisabled,
        outrosMastersAtivos,
      });
      if (derruba) {
        console.error(
          `[onUserProfileWritten] BLOQUEADO: ${uid} é o último master ativo de ${tenantId}. ` +
          "Documento restaurado; claims intactas.",
        );
        await after.ref.update({ role: before!.role, isActive: before!.isActive ?? true });
        return;
      }
    }

    try {
      if (!claimsOk) {
        await auth.setCustomUserClaims(uid, { ...desired });
      }
      if (!disabledOk) {
        await auth.updateUser(uid, { disabled: shouldBeDisabled });
      }
      // Revoga nos dois casos: o token em circulação carrega o papel antigo e,
      // num bloqueio, continuaria aceito até expirar sozinho.
      await auth.revokeRefreshTokens(uid);

      console.log(
        `[onUserProfileWritten] ${uid}@${tenantId} sincronizado: ` +
        `role=${desired.role} produtos=[${desired.productIds.join(",")}] ` +
        `disabled=${shouldBeDisabled} (claims=${claimsOk ? "ok" : "regravadas"})`,
      );
    } catch (err) {
      console.error(`[onUserProfileWritten] Falha ao sincronizar ${uid}@${tenantId}:`, err);
      throw err; // deixa o retry automático do Functions tentar de novo
    }
  },
);
