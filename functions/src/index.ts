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

// Cadência SDR (Fase 4)
export { dailyCadenceEngine } from "./cadence/dailyCadenceEngine";

// Handoff Rep (Fase 5)
export { acceptHandoff, declineHandoff } from "./handoff/acceptHandoff";

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

// Comissões — fila de avaliação do dia 10 (Fase 5)
export { commissionEvaluationQueue } from "./comissoes/commissionEvaluationQueue";
