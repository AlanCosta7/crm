/**
 * sendEmail.ts — Callable: envia email pela conta Gmail do próprio usuário
 *
 * Fase 2 do "registro automático de ações no card".
 *
 * Reaproveita o OAuth do Google já usado pelo Calendar (tokens em
 * /tenants/{tid}/calendar_tokens/{uid}). Exige o escopo `gmail.send`
 * (adicionado a SCOPES em calendarService.ts — o usuário precisa reconsentir
 * uma vez reconectando o Google).
 *
 * sendEmail({ tenantId, to, subject, body }):
 *  1. Valida auth + campos.
 *  2. Carrega o cliente OAuth autenticado do usuário (refresh automático).
 *  3. Monta a mensagem RFC 2822 e envia via Gmail API (users.messages.send).
 *  4. Retorna { messageId }. O registro da Activity é feito no cliente.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../calendar/calendarService";

const REGION = "southamerica-east1";

interface SendEmailData {
  tenantId: string;
  to: string;
  subject: string;
  body: string;
  /** Nome de exibição do remetente (opcional). */
  fromName?: string;
}

/** Codifica em base64url (formato exigido pela Gmail API para o campo `raw`). */
function toBase64Url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Codifica o Subject em MIME encoded-word para suportar acentos (UTF-8). */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export const sendEmail = onCall(
  { region: REGION, secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] },
  async (request) => {
  const { tenantId, to, subject, body, fromName } = (request.data || {}) as SendEmailData;
  const uid = request.auth?.uid;

  if (!uid)      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!tenantId) throw new HttpsError("invalid-argument", "tenantId é obrigatório.");
  if (!to)       throw new HttpsError("invalid-argument", "Destinatário (to) é obrigatório.");
  if (!subject)  throw new HttpsError("invalid-argument", "Assunto é obrigatório.");

  const db = admin.firestore();

  // Garante que o usuário pertence ao tenant
  const userSnap = await db.doc(`tenants/${tenantId}/users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "Usuário não pertence ao tenant.");
  }

  let auth;
  try {
    auth = await getAuthenticatedClient(db, tenantId, uid);
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "Google não conectado ou sem permissão de envio. Reconecte o Google nas configurações para autorizar o envio de email.",
    );
  }

  const gmail = google.gmail({ version: "v1", auth });

  // Remetente: endereço da conta conectada (token contém o email do usuário).
  const fromEmail = userSnap.data()?.email || "me";
  const fromHeader = fromName ? `${encodeHeader(fromName)} <${fromEmail}>` : fromEmail;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  const raw = toBase64Url(`${headers.join("\r\n")}\r\n\r\n${body || ""}`);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log(`[sendEmail] Email enviado por ${uid} para ${to} — id=${res.data.id}`);
    return { messageId: res.data.id, threadId: res.data.threadId };
  } catch (err: any) {
    const msg = err?.errors?.[0]?.message || err?.message || "Erro desconhecido.";
    console.error(`[sendEmail] Falha ao enviar para ${to}:`, msg);
    // Escopo gmail.send ausente normalmente retorna 403 insufficient permissions
    if (err?.code === 403 || /insufficient|scope|permission/i.test(msg)) {
      throw new HttpsError(
        "permission-denied",
        "Permissão de envio de email ausente. Reconecte o Google para autorizar o escopo de envio.",
      );
    }
    throw new HttpsError("internal", `Falha ao enviar email: ${msg}`);
  }
});
