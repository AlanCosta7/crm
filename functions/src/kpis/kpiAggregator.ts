import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

/**
 * Cloud Function agendada que roda de hora em hora.
 * Consolida as métricas do CRM por vendedor, por produto e para a filial inteira.
 * Salva no Firestore sob `/tenants/{tenantId}/kpi_snapshots/`.
 */
export const kpiAggregator = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "America/Sao_Paulo",
    memory: "512MiB",
  },
  async () => {
    const db = admin.firestore();
    const tenantsSnap = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      try {
        console.log(`[kpiAggregator] Iniciando agregação para o tenant: ${tenantId}`);
        await aggregateTenantKpis(tenantId);
        console.log(`[kpiAggregator] Concluído com sucesso para o tenant: ${tenantId}`);
      } catch (err) {
        console.error(`[kpiAggregator] Erro ao processar tenant ${tenantId}:`, err);
      }
    }
  }
);

async function aggregateTenantKpis(tenantId: string) {
  const db = admin.firestore();
  const now = new Date();
  
  // Períodos de data
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 1. Busca usuários
  const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }) as { id: string; role: string; name: string });

  // 2. Busca negócios (deals) modificados ou ativos
  const dealsSnap = await db.collection(`tenants/${tenantId}/deals`).get();
  const deals = dealsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);

  // 3. Busca atividades deste mês
  const activitiesSnap = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("createdAt", ">=", startOfMonth)
    .get();
  const activities = activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);

  // 3b. v3: Busca user_goals para calcular activitiesGoal por SDR
  const goalsSnap = await db.collection(`tenants/${tenantId}/user_goals`).get();
  const userGoals: Record<string, any> = {};
  goalsSnap.docs.forEach(d => { userGoals[d.id] = d.data(); });

  // 4. Busca coin ledger deste mês
  const ledgerSnap = await db
    .collection(`tenants/${tenantId}/coin_ledger`)
    .where("createdAt", ">=", startOfMonth)
    .get();
  const ledger = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);

  // Produtos possíveis
  const products = ["wizmart", "smart_cafe", "all"];

  // Gerar Snapshots: Mensal e Diário
  const batch = db.batch();

  // Função auxiliar para registrar snapshot
  const saveSnapshot = (
    role: string,
    userId: string | null,
    productId: string,
    periodType: "daily" | "monthly",
    period: string,
    metrics: any
  ) => {
    const snapId = `${role}:${userId || "all"}:${productId}:${periodType}:${period}`;
    const snapRef = db.doc(`tenants/${tenantId}/kpi_snapshots/${snapId}`);
    
    batch.set(snapRef, {
      role,
      userId: userId || null,
      productId: productId === "all" ? null : productId,
      period,
      periodType,
      ...metrics,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  };

  // Computa métricas para cada produto
  for (const prod of products) {
    // Filtro por produto
    const prodFilter = (item: any) => prod === "all" || item.productId === prod;

    const filteredDeals = deals.filter(prodFilter);
    const filteredActivities = activities.filter(prodFilter);

    // ── MÉTRICAS GERAIS DO TENANT (all) ──
    const tenantDealsCreated = filteredDeals.filter(d => d.createdAt && d.createdAt.toDate() >= startOfMonth).length;
    const tenantDealsWon = filteredDeals.filter(d => d.status === "won" && d.updatedAt && d.updatedAt.toDate() >= startOfMonth).length;
    const tenantDealsLost = filteredDeals.filter(d => d.status === "lost" && d.updatedAt && d.updatedAt.toDate() >= startOfMonth).length;
    const tenantTotalRevenue = filteredDeals.filter(d => d.status === "won" && d.updatedAt && d.updatedAt.toDate() >= startOfMonth).reduce((sum, d) => sum + (d.value || 0), 0);
    
    const visitsByState: Record<string, number> = {};
    const visitsByCity: Record<string, number> = {};

    filteredDeals.forEach(d => {
      if (d.location && d.location.state) {
        visitsByState[d.location.state] = (visitsByState[d.location.state] || 0) + 1;
      }
      if (d.location && d.location.city) {
        visitsByCity[d.location.city] = (visitsByCity[d.location.city] || 0) + 1;
      }
    });

    const tenantCoinsDistributed = ledger.filter(tx => tx.amount > 0 && prodFilter(tx)).reduce((sum, tx) => sum + tx.amount, 0);

    // ── v3: KPIs da diretoria ─────────────────────────────────────────────────

    // Prospects compartilhados: deals com bdrId E assignedSdrId preenchidos
    const prospectsShared = filteredDeals.filter(d =>
      d.bdrId && d.assignedSdrId &&
      d.createdAt && d.createdAt.toDate() >= startOfMonth
    ).length;

    // Atividades de hoje: completadas x meta total dos SDRs
    const sdrs = users.filter(u => u.role === "sdr");
    const activitiesGoal = sdrs.reduce((sum, sdr) => sum + (userGoals[sdr.id]?.activitiesPerDay ?? 4), 0);
    const activitiesToday = activities.filter(a =>
      a.status === "completed" &&
      a.createdAt && a.createdAt.toDate() >= startOfToday
    ).length;

    // Visitas agendadas por estado (deals em visita_agendada)
    const visitsScheduledByState: Record<string, number> = {};
    filteredDeals
      .filter(d => d.stage === "visita_agendada")
      .forEach(d => {
        const uf = d.location?.state || "Sem UF";
        visitsScheduledByState[uf] = (visitsScheduledByState[uf] || 0) + 1;
      });

    // Conquistas em PDVs (deals status=won com conquestValue)
    const conquestsPdv = filteredDeals
      .filter(d => d.status === "won" && d.updatedAt && d.updatedAt.toDate() >= startOfMonth)
      .reduce((sum, d) => sum + (d.conquestValue || 1), 0);

    // Instalações agendadas (deals em instalacao_agendada)
    const installations = filteredDeals.filter(d => d.stage === "instalacao_agendada").length;

    const monthlyGeneralMetrics = {
      dealsCreated: tenantDealsCreated,
      dealsWon: tenantDealsWon,
      dealsLost: tenantDealsLost,
      revenue: tenantTotalRevenue,
      conversionRate: Math.round((tenantDealsWon / Math.max(1, tenantDealsWon + tenantDealsLost)) * 100),
      coinsEarned: tenantCoinsDistributed,
      visitsByState,
      visitsByCity,
      // v3
      prospectsShared,
      activitiesGoal,
      activitiesActual: activitiesToday,
      visitsScheduledByState,
      conquestsPdv,
      installations,
    };

    saveSnapshot("all", null, prod, "monthly", currentMonthStr, monthlyGeneralMetrics);

    // Métricas diárias gerais do tenant
    const dailyDealsCreated = filteredDeals.filter(d => d.createdAt && d.createdAt.toDate() >= startOfToday).length;
    const dailyDealsWon = filteredDeals.filter(d => d.status === "won" && d.updatedAt && d.updatedAt.toDate() >= startOfToday).length;
    const dailyRevenue = filteredDeals.filter(d => d.status === "won" && d.updatedAt && d.updatedAt.toDate() >= startOfToday).reduce((sum, d) => sum + (d.value || 0), 0);
    
    const dailyGeneralMetrics = {
      dealsCreated: dailyDealsCreated,
      dealsWon: dailyDealsWon,
      revenue: dailyRevenue,
      coinsEarned: ledger.filter(tx => tx.amount > 0 && tx.createdAt && tx.createdAt.toDate() >= startOfToday && prodFilter(tx)).reduce((sum, tx) => sum + tx.amount, 0),
    };

    saveSnapshot("all", null, prod, "daily", todayStr, dailyGeneralMetrics);

    // ── MÉTRICAS POR USUÁRIO ──
    for (const user of users) {
      // 1. SDR KPIs
      if (user.role === "sdr" || user.role === "master" || user.role === "manager") {
        const userActivities = filteredActivities.filter(a => a.userId === user.id);
        const userMonthActs = userActivities.filter(a => a.createdAt && a.createdAt.toDate() >= startOfMonth);
        const userTodayActs = userActivities.filter(a => a.createdAt && a.createdAt.toDate() >= startOfToday);

        const sdrMonthlyMetrics = {
          activitiesEmail: userMonthActs.filter(a => a.type === "email" && a.status === "completed").length,
          activitiesLinkedin: userMonthActs.filter(a => a.type === "linkedin" && a.status === "completed").length,
          activitiesWhatsapp: userMonthActs.filter(a => a.type === "whatsapp" && a.status === "completed").length,
          activitiesCall: userMonthActs.filter(a => a.type === "call" && a.status === "completed").length,
          meetingsScheduled: filteredDeals.filter(d => d.assignedSdrId === user.id && d.createdAt && d.createdAt.toDate() >= startOfMonth).length,
          visitsScheduled: filteredDeals.filter(d => d.assignedSdrId === user.id && d.visitScheduledAt && d.visitScheduledAt.toDate() >= startOfMonth).length,
          coinsEarned: ledger.filter(tx => tx.userId === user.id && tx.amount > 0 && tx.createdAt && tx.createdAt.toDate() >= startOfMonth).reduce((sum, tx) => sum + tx.amount, 0),
          cadenceCompletionRate: Math.round((userMonthActs.filter(a => a.status === "completed").length / Math.max(1, userMonthActs.length)) * 100),
        };

        saveSnapshot("sdr", user.id, prod, "monthly", currentMonthStr, sdrMonthlyMetrics);

        const sdrDailyMetrics = {
          activitiesEmail: userTodayActs.filter(a => a.type === "email" && a.status === "completed").length,
          activitiesLinkedin: userTodayActs.filter(a => a.type === "linkedin" && a.status === "completed").length,
          activitiesWhatsapp: userTodayActs.filter(a => a.type === "whatsapp" && a.status === "completed").length,
          activitiesCall: userTodayActs.filter(a => a.type === "call" && a.status === "completed").length,
          cadenceCompletionRate: Math.round((userTodayActs.filter(a => a.status === "completed").length / Math.max(1, userTodayActs.length)) * 100),
        };

        saveSnapshot("sdr", user.id, prod, "daily", todayStr, sdrDailyMetrics);
      }

      // 2. REP KPIs
      if (user.role === "rep" || user.role === "master" || user.role === "manager") {
        const userDeals = filteredDeals.filter(d => d.assignedRepId === user.id);
        const userMonthDeals = userDeals.filter(d => d.updatedAt && d.updatedAt.toDate() >= startOfMonth);
        const userTodayDeals = userDeals.filter(d => d.updatedAt && d.updatedAt.toDate() >= startOfToday);

        const repMonthlyMetrics = {
          visitsDone: userMonthDeals.filter(d => d.visitDoneAt).length,
          proposalsPresented: userMonthDeals.filter(d => d.stage === "proposta_apresentada").length,
          contractsSigned: userMonthDeals.filter(d => d.stage === "contrato_assinado").length,
          // v3: conquistas em PDVs (conquestValue), não em unidades
          pdvsConquered: userMonthDeals
            .filter(d => d.status === "won")
            .reduce((sum, d) => sum + (d.conquestValue || 1), 0),
          revenue: userMonthDeals.filter(d => d.status === "won").reduce((sum, d) => sum + (d.value || 0), 0),
          coinsEarned: ledger.filter(tx => tx.userId === user.id && tx.amount > 0 && tx.createdAt && tx.createdAt.toDate() >= startOfMonth).reduce((sum, tx) => sum + tx.amount, 0),
        };

        saveSnapshot("rep", user.id, prod, "monthly", currentMonthStr, repMonthlyMetrics);

        const repDailyMetrics = {
          pdvsConquered: userTodayDeals.filter(d => d.status === "won").length,
          revenue: userTodayDeals.filter(d => d.status === "won").reduce((sum, d) => sum + (d.value || 0), 0),
          coinsEarned: ledger.filter(tx => tx.userId === user.id && tx.amount > 0 && tx.createdAt && tx.createdAt.toDate() >= startOfToday).reduce((sum, tx) => sum + tx.amount, 0),
        };

        saveSnapshot("rep", user.id, prod, "daily", todayStr, repDailyMetrics);
      }
    }
  }

  // Commit do batch
  await batch.commit();
}
