/**
 * mintHandoffToken.ts — Callable: emite um custom token para o PRÓPRIO
 * usuário autenticado, usado pelo handoff de SSO entre o wizmart-rep-app
 * (origem própria, wizmart-rep.web.app) e este CRM completo.
 *
 * Por que precisa disso e não dá pra só compartilhar a sessão: o Rep App e o
 * CRM completo são origens diferentes de propósito (isolamento de cache
 * offline — ver PLANO_PWA_REPRESENTANTES.md §2.2 no wizmart-crm), e o Firebase
 * Auth persiste a sessão por origem (IndexedDB), não entre domínios. O padrão
 * de handoff é: o app de origem pede um custom token pra si mesmo, redireciona
 * pro destino com o token na URL, e o destino troca esse token por uma sessão
 * de verdade via signInWithCustomToken — ver src/features/auth/SsoPage.tsx.
 *
 * Diferente de impersonateUser (que emite token para um ALVO diferente do
 * chamador, e por isso precisa validar quem pode virar quem): aqui o alvo é
 * sempre o próprio chamador — não há verificação de permissão além de "está
 * autenticado", porque ninguém está assumindo a identidade de outra pessoa.
 *
 * Segurança: o custom token do Firebase expira em ~1h e este fluxo o troca
 * por uma sessão em segundos (não fica exposto por muito tempo); o
 * SsoPage remove o token da URL/histórico assim que a troca é concluída.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const REGION = "southamerica-east1";

export const mintHandoffToken = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const token = await admin.auth().createCustomToken(uid);
  return { token };
});
