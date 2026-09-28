import * as admin from "firebase-admin";

// Inicializa a instância administrativa padrão do Firebase SDK
admin.initializeApp();

// Exporta as Cloud Functions

// Gamificação v1 (compatibilidade)
export { onDealCreate }   from "./gamification/onDealCreate";
export { onTaskComplete } from "./gamification/onTaskComplete";
export { onDealWon }      from "./gamification/onDealWon";

// TV Display
export { onTokenChange }  from "./tv/onTokenChange";

// Integrações
export { syncMoskit }     from "./integrations/syncMoskit";

// Deals v2 — Convergência de funis (Fase 3)
export { onDealStageChanged } from "./deals/onDealStageChanged";

// Assinaturas do card — participantIds/responsibleId (Plano de Assinaturas, Fase A)
export { onDealParticipantsChanged } from "./deals/syncDealParticipants";
export { onDealResponsibleChanged } from "./deals/reassignPendingActivities";

// Rastreio de passagem de bastão (Plano de Assinaturas, Fase C)
export { onDealTimelineEvents } from "./deals/dealTimelineEvents";

// Cadência SDR (Fase 4)
export { dailyCadenceEngine } from "./cadence/dailyCadenceEngine";

// Handoff Rep (Fase 5)
export { acceptHandoff, declineHandoff } from "./handoff/acceptHandoff";
export { onHandoffCreated } from "./handoff/onHandoffCreated";

// SLA Rep + Overdue Checker (Fase 5)
export { repSlaChecker, activityOverdueChecker } from "./cadence/repSlaChecker";

// Moedas e Loja (Fase 7)
export { onCoinTransactionCreated } from "./coins/onCoinTransactionCreated";
export { redeemCoins }              from "./coins/redeemCoins";
export { onActivityCompleted }      from "./coins/onActivityCompleted";

// Google Calendar (Fase 6)
export { calendarOAuthStart }     from "./integrations/calendar/calendarOAuthStart";
export { calendarOAuthCallback }  from "./integrations/calendar/calendarOAuthCallback";
export { onActivityScheduled, syncCalendarEvent, disconnectCalendar } from "./integrations/calendar/onActivityScheduled";

// Envio de email via Gmail API (Fase 2 — registro automático de ações)
export { sendEmail } from "./integrations/email/sendEmail";

// KPIs & Dashboards (Fase 8)
export { kpiAggregator } from "./kpis/kpiAggregator";
export { tvDataRefresher } from "./tv/tvDataRefresher";

// Projetos de Layout — Sprint 4/6
export { onProjectRequestCreated, onProjectRequestChanged } from "./projects/onProjectRequestChanged";

// Notas ricas do card — espelho no feed e limpeza dos anexos
export { onNoteWritten } from "./notes/onNoteWritten";
export { onNoteDeleted } from "./notes/onNoteDeleted";
export { janitorNoteAttachments } from "./notes/janitorNoteAttachments";

// Comissões — fila de avaliação do dia 10 (Fase 5)
export { commissionEvaluationQueue } from "./comissoes/commissionEvaluationQueue";
// Lembrete de contratos de Comodato pendentes — dia 09, véspera da avaliação (Fase 5.4)
export { contractReminderEmail } from "./comissoes/contractReminderEmail";

// ── Usuários ──────────────────────────────────────────────────────────────────
export { inviteUser } from "./users/inviteUser";
// Claims fiéis ao documento: papel, produtos e bloqueio de acesso (PLANO_DESENHO_CRM.md Fase 0)
export { onUserProfileWritten } from "./users/syncUserClaims";
export { impersonateUser } from "./users/impersonateUser";
export { endImpersonation } from "./users/endImpersonation";
// SSO Rep App ↔ CRM completo (PLANO_PWA_REPRESENTANTES.md §3.3)
export { mintHandoffToken } from "./users/mintHandoffToken";
// Push real do Rep App — resumo da manhã (PLANO_PWA_REPRESENTANTES.md §8)
export { sendRepDailyAgendaPush } from "./users/repDailyAgendaPush";
// Auditoria de sessão — login/logoff e encerramento forçado (PLANO_DESENHO_CRM.md Fase 6.1)
export { logSessionEvent } from "./users/logSessionEvent";
export { endUserSession } from "./users/endUserSession";

// ── Captação de Leads — WizMart Forms ─────────────────────────────────────────
export { captureLead } from "./leads/captureLead";
export { onLeadCreated } from "./leads/onLeadCreated";
