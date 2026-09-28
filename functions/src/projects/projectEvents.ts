/**
 * projectEvents.ts — textos e destinatários do fluxo de Solicitação de Projeto
 * (PLANO_DESENHO_CRM_2.md, A5 e A7). Puro, sem I/O: os triggers só gravam.
 *
 * Word do cliente: "O histórico de solicitação deve ficar registrado na linha do
 * tempo do card" e "uma vez solicitado e entregue, esse projeto entra na linha
 * do tempo do Card". Três marcos: solicitado, em andamento (Design pegou) e
 * entregue — cada um com quem fez e, na entrega, os arquivos.
 */

export interface ProjectDoc {
  dealId?: string;
  companyName?: string;
  requestedBy?: string;
  requestedByName?: string;
  pdvTypes?: string[];
  status?: string;
  assignedToDesignerId?: string;
  assignedToDesignerName?: string;
  deliveredByName?: string;
  deliveredFileUrl?: string;
  deliveredAttachments?: { name?: string; url?: string }[];
}

export interface TimelineLink { label: string; url: string }

export interface TimelineEventDraft {
  type: "project_requested" | "project_in_progress" | "project_delivered";
  message: string;
  createdBy: string;
  /** Links já resolvidos — a UI renderiza como botão, sem parsear markdown. */
  links?: TimelineLink[];
}

const PDV_LABEL: Record<string, string> = {
  nanomarket: "Nanomarket",
  micromarket: "Micromarket",
  store: "Loja",
  container: "Container",
};

export function pdvLabels(types: string[] | undefined): string {
  const l = (types ?? []).map((t) => PDV_LABEL[t] ?? t);
  return l.length ? l.join(" + ") : "PDV";
}

export function requestedEvent(p: ProjectDoc): TimelineEventDraft {
  return {
    type: "project_requested",
    message: `📐 Projeto de layout solicitado por ${p.requestedByName || "—"} (${pdvLabels(p.pdvTypes)})`,
    createdBy: p.requestedBy || "system",
  };
}

export function inProgressEvent(p: ProjectDoc, designerName: string): TimelineEventDraft {
  return {
    type: "project_in_progress",
    message: `🛠️ Projeto de layout em andamento — ${designerName} pegou o pedido`,
    createdBy: p.assignedToDesignerId || "system",
  };
}

export function deliveredEvent(p: ProjectDoc, designerName: string): TimelineEventDraft {
  const links: TimelineLink[] = (p.deliveredAttachments ?? [])
    .filter((a) => a?.url)
    .map((a) => ({ label: a.name || "Arquivo do projeto", url: a.url! }));
  if (p.deliveredFileUrl) links.push({ label: "Abrir link do projeto", url: p.deliveredFileUrl });
  return {
    type: "project_delivered",
    message: `✅ Projeto de layout entregue por ${designerName}`,
    createdBy: p.assignedToDesignerId || "system",
    ...(links.length ? { links } : {}),
  };
}

/** Quem avisar quando entra pedido novo: todo usuário Design ativo. */
export function designRecipients(users: { id: string; role?: string; isActive?: boolean }[]): string[] {
  return users.filter((u) => u.role === "design" && u.isActive !== false).map((u) => u.id);
}

export interface NotificationDraft {
  userId: string;
  type: "project_requested" | "project_delivered";
  title: string;
  body: string;
  dealId?: string;
  /** Rota interna para onde o sino leva. Sem ela, vai para o card. */
  link?: string;
}

export function requestedNotifications(p: ProjectDoc, recipients: string[]): NotificationDraft[] {
  return recipients.map((userId) => ({
    userId,
    type: "project_requested" as const,
    title: "Novo projeto na fila",
    body: `${p.companyName || "Cliente"} — pedido de ${p.requestedByName || "—"} (${pdvLabels(p.pdvTypes)})`,
    dealId: p.dealId,
    link: "/design-queue",
  }));
}

export function deliveredNotification(p: ProjectDoc, designerName: string): NotificationDraft | null {
  if (!p.requestedBy) return null;
  return {
    userId: p.requestedBy,
    type: "project_delivered",
    title: "Seu projeto de layout foi entregue",
    body: `${p.companyName || "Cliente"} — entregue por ${designerName}`,
    dealId: p.dealId,
  };
}
