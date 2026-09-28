/**
 * mailer.ts — Envio de e-mail transacional via SMTP (nodemailer / GoDaddy)
 *
 * Credenciais em Secret Manager: SMTP_EMAIL, SMTP_PASSWORD.
 * Usado pelo callable inviteUser para enviar a senha temporária ao novo usuário.
 */

import * as nodemailer from "nodemailer";

const ROLE_LABELS: Record<string, string> = {
  master:  "Administrador Master",
  manager: "Gestor Comercial",
  bdr:     "BDR — Prospector",
  sdr:     "SDR — Pré-venda",
  rep:     "Representante",
  design:  "Designer",
  viewer:  "Visualizador",
  financeiro: "Financeiro",
};

export function createTransporter() {
  const user = process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error("Credenciais SMTP ausentes (SMTP_EMAIL / SMTP_PASSWORD).");
  }
  return nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
  });
}

interface InviteEmailInput {
  to: string;
  name: string;
  role: string;
  tempPassword: string;
  loginUrl: string;
}

/** Template HTML branded WizMart (paleta verde #1A6B1A / #8DB600). */
function buildInviteHtml({ name, role, tempPassword, loginUrl }: InviteEmailInput): string {
  const roleLabel = ROLE_LABELS[role] || role;
  const firstName = name.trim().split(/\s+/)[0];
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,107,26,0.10);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1A6B1A 0%,#8DB600 100%);padding:36px 40px;">
          <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">WizMart<span style="opacity:0.85;font-weight:600;"> CRM</span></div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Plataforma de Gestão Comercial</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">Olá, ${firstName}! 👋</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
            Seu acesso ao <strong>WizMart CRM</strong> foi criado com o perfil de
            <strong style="color:#1A6B1A;">${roleLabel}</strong>. Use as credenciais abaixo para entrar:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f0;border:1px solid #d7ead7;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;margin-bottom:4px;">Senha temporária</div>
              <div style="font-size:24px;font-weight:800;color:#1A6B1A;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:1px;">${tempPassword}</div>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="border-radius:10px;background:#1A6B1A;">
              <a href="${loginUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Acessar o WizMart CRM →</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
            🔒 Por segurança, <strong>altere sua senha</strong> no primeiro acesso, em Configurações.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
            Se você não esperava este e-mail, pode ignorá-lo com segurança.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background:#fafafa;border-top:1px solid #eef0ee;">
          <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
            WizMart CRM · Plataforma de Gestão Comercial<br>
            Este é um e-mail automático — não responda.
          </div>
        </td></tr>
      </table>
      <div style="max-width:560px;margin-top:16px;font-size:11px;color:#b0b7b0;">© ${new Date().getFullYear()} WizMart CRM. Todos os direitos reservados.</div>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildInviteText({ name, role, tempPassword, loginUrl }: InviteEmailInput): string {
  const roleLabel = ROLE_LABELS[role] || role;
  return [
    `Olá, ${name.trim().split(/\s+/)[0]}!`,
    ``,
    `Seu acesso ao WizMart CRM foi criado com o perfil de ${roleLabel}.`,
    ``,
    `Senha temporária: ${tempPassword}`,
    `Acesse: ${loginUrl}`,
    ``,
    `Por segurança, altere sua senha no primeiro acesso (Configurações).`,
    ``,
    `WizMart CRM — Plataforma de Gestão Comercial`,
  ].join("\n");
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<string> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"WizMart CRM" <${process.env.SMTP_EMAIL}>`,
    to: input.to,
    subject: "Seu acesso ao WizMart CRM 🚀",
    text: buildInviteText(input),
    html: buildInviteHtml(input),
  });
  return info.messageId;
}

// ── Lembrete de contratos pendentes — Fase 5.4 do PLANO_DESENHO_CRM.md ────────
// Slide 11: "todo dia 09 um alerta é disparado para a caixa de e-mail do
// financeiro entrar no CRM e validar ou não." Enviado por
// `functions/src/comissoes/contractReminderEmail.ts` (cron dia 09, 9h BRT).

export interface ContractReminderItem {
  dealId: string;
  company: string;
  dealName: string;
  contractUrl: string;
}

interface ContractReminderInput {
  to: string;
  name: string;
  items: ContractReminderItem[];
  appUrl: string;
}

function buildContractReminderHtml({ name, items, appUrl }: ContractReminderInput): string {
  const firstName = name.trim().split(/\s+/)[0];
  const rows = items.map(it => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eef0ee;font-size:13px;color:#111827;">${it.company}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef0ee;font-size:13px;color:#6b7280;">${it.dealName}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef0ee;font-size:13px;">
        <a href="${it.contractUrl}" target="_blank" style="color:#5E3A26;font-weight:600;text-decoration:none;">Ver PDF</a>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(94,58,38,0.10);">
        <tr><td style="background:linear-gradient(135deg,#5E3A26 0%,#92400E 100%);padding:32px 40px;">
          <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Smart Café<span style="opacity:0.85;font-weight:600;"> · Comodato</span></div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Contratos aguardando validação do financeiro</div>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Olá, ${firstName} 👋</h1>
          <p style="margin:0 0 20px;font-size:14.5px;line-height:1.6;color:#374151;">
            ${items.length} contrato${items.length > 1 ? "s" : ""} de Comodato ${items.length > 1 ? "estão" : "está"}
            com o PDF anexado, aguardando você confirmar o pagamento da 1ª mensalidade.
            Amanhã (dia 10) essas ativações entram na avaliação de comissão.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0ee;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            <tr style="background:#faf7f5;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Empresa</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Negócio</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Contrato</th>
            </tr>
            ${rows}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="border-radius:10px;background:#5E3A26;">
              <a href="${appUrl}/financeiro/contratos" target="_blank" style="display:inline-block;padding:13px 28px;font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Abrir fila de contratos →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #eef0ee;">
          <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
            WizMart CRM · Este é um e-mail automático, enviado todo dia 09 às 9h — não responda.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildContractReminderText({ name, items, appUrl }: ContractReminderInput): string {
  return [
    `Olá, ${name.trim().split(/\s+/)[0]}!`,
    ``,
    `${items.length} contrato(s) de Comodato Smart Café aguardam confirmação de pagamento:`,
    ``,
    ...items.map(it => `- ${it.company} (${it.dealName}): ${it.contractUrl}`),
    ``,
    `Abra a fila: ${appUrl}/financeiro/contratos`,
    ``,
    `WizMart CRM`,
  ].join("\n");
}

export async function sendContractReminderEmail(input: ContractReminderInput): Promise<string> {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"WizMart CRM" <${process.env.SMTP_EMAIL}>`,
    to: input.to,
    subject: `📋 ${input.items.length} contrato(s) de Comodato aguardando validação`,
    text: buildContractReminderText(input),
    html: buildContractReminderHtml(input),
  });
  return info.messageId;
}
