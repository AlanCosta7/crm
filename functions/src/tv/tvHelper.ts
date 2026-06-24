import * as admin from "firebase-admin";

/**
 * Consolida dados em tempo real para um canal de TV específico e atualiza no RTDB `/public_tv/{token}`.
 * Filtra dados de acordo com o `productId` do link ('all', 'wizmart', 'smart_cafe').
 */
export async function refreshTvSnapshot(tenantId: string, linkId: string, linkData: any) {
  const db = admin.firestore();
  const rtdb = admin.database();

  const token = linkData.token;
  const productId = linkData.productId || "all";
  const allowed = linkData.allowedMetrics || [];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 1. Busca deals do Firestore
  let dealsRef = db.collection(`tenants/${tenantId}/deals`);
  const dealsSnap = await dealsRef.get();
  const deals = dealsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);

  // Filtra por produto se aplicável
  const prodFilter = (d: any) => productId === "all" || d.productId === productId;
  const filteredDeals = deals.filter(prodFilter);

  // Converte updatedAt em Date de forma defensiva: Timestamp, Date, ISO string ou epoch.
  const asDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // Calcule os KPIs mensais e diários
  const wonDealsMonth = filteredDeals.filter(d => {
    if (d.stage !== "fecham" && d.status !== "won") return false;
    const u = asDate(d.updatedAt);
    return u != null && u >= startOfMonth;
  });

  const wonDealsToday = filteredDeals.filter(d => {
    if (d.stage !== "fecham" && d.status !== "won") return false;
    const u = asDate(d.updatedAt);
    return u != null && u >= startOfToday;
  });

  const monthRevenue = wonDealsMonth.reduce((sum, d) => sum + (d.value || 0), 0);
  const todayRevenue = wonDealsToday.reduce((sum, d) => sum + (d.value || 0), 0);
  const todayDeals = wonDealsToday.length;

  // Busca metas no Settings se existir, senão usa padrão
  let monthGoal = 1200000;
  if (productId === "smart_cafe") {
    monthGoal = 600000;
  } else if (productId === "all") {
    monthGoal = 1800000;
  }

  try {
    const configSnap = await db.doc(`tenants/${tenantId}/settings/config`).get();
    if (configSnap.exists) {
      const configData = configSnap.data();
      if (productId === "smart_cafe" && configData?.monthGoalSmartCafe) {
        monthGoal = configData.monthGoalSmartCafe;
      } else if (productId === "wizmart" && configData?.monthGoalWizmart) {
        monthGoal = configData.monthGoalWizmart;
      } else if (configData?.monthGoal) {
        monthGoal = configData.monthGoal;
      }
    }
  } catch (err) {
    console.warn("[tvHelper] Não foi possível ler meta das configurações, usando default:", err);
  }

  const liveKpis = {
    monthRevenue,
    monthGoal,
    todayDeals,
    todayRevenue
  };

  // 2. Desempenho dos vendedores (soma de negócios ganhos por vendedor)
  const sellerWonSums: Record<string, number> = {};
  wonDealsMonth.forEach(d => {
    const owner = d.assignedRepId || d.owner || "unknown";
    sellerWonSums[owner] = (sellerWonSums[owner] || 0) + (d.value || 0);
  });

  // Mapeia para a estrutura de barra de ganhos do time
  const sellersList: any[] = [];
  try {
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();
    
    // Lista de vendedores reais (sellers ou users com role rep/sdr)
    const activeUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
    
    // Se o canal for de produto específico, filtra vendedores que têm acesso a esse produto
    const filteredUsers = activeUsers.filter(u => 
      productId === "all" || (u.productIds && u.productIds.includes(productId))
    );

    filteredUsers.forEach(u => {
      const val = sellerWonSums[u.id] || 0;
      sellersList.push({
        name: u.name || "Vendedor",
        val: val,
        // Pct proporcional a uma meta de faturamento individual de R$ 150.000
        pct: Math.min(Math.round((val / 150000) * 100), 100)
      });
    });
  } catch (err) {
    console.error("[tvHelper] Erro ao mapear dados de vendedores:", err);
  }

  // 3. Progresso de tarefas diárias
  let tasks = { done: 0, total: 0 };
  try {
    const activitiesSnap = await db.collection(`tenants/${tenantId}/activities`)
      .where("createdAt", ">=", startOfToday)
      .get();
    const activities = activitiesSnap.docs.map(doc => doc.data() as any);
    
    const todayActs = activities.filter(a => 
      (productId === "all" || a.productId === productId) &&
      a.status !== "skipped"
    );

    tasks.total = todayActs.length;
    tasks.done = todayActs.filter(a => a.status === "completed").length;
  } catch (err) {
    console.error("[tvHelper] Erro ao computar progresso de tarefas diárias:", err);
  }

  // 4. Leaderboard de pontuações
  let leaderboard: any = null;
  try {
    const lbSnap = await rtdb.ref(`tenants/${tenantId}/leaderboard`).get();
    const lbVal = lbSnap.val() || {};

    // Se o canal for específico, filtra usuários do leaderboard
    const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();
    const activeUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);

    const filteredLb: Record<string, any> = {};
    Object.entries(lbVal).forEach(([uid, val]: [string, any]) => {
      const u = activeUsers.find(x => x.id === uid);
      if (u) {
        if (productId === "all" || (u.productIds && u.productIds.includes(productId))) {
          filteredLb[uid] = val;
        }
      }
    });
    leaderboard = filteredLb;
  } catch (err) {
    console.error("[tvHelper] Erro ao recuperar leaderboard do RTDB:", err);
  }

  // Constrói o snapshot unificado
  const tvSnapshot = {
    tenantId,
    tenantName: linkData.deviceName || "WizMart Display",
    expiresAt: linkData.expires,
    allowedMetrics: allowed,
    productId,
    live_kpis: liveKpis,
    sellers: sellersList.sort((a, b) => b.val - a.val),
    tasks: tasks,
    leaderboard: leaderboard
  };

  // Salva o snapshot no RTDB no nó de acesso público sem credenciais
  await rtdb.ref(`public_tv/${token}`).set(tvSnapshot);
  console.log(`[tvHelper] Mirror de TV atualizado com sucesso no RTDB para o token ${token} (produto: ${productId})`);
}
