import * as admin from "firebase-admin";
import { computeOrigin } from "../deals/dealOrigin";
import { buildSdrRanking, firstName, periodStartsBRT, type SdrActivity, type SdrEvent, type SdrRanking } from "./rankingSdr";

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
        // Nó público: só o primeiro nome (decisão do cliente, 25/09/2026).
        name: firstName(u.name || "Vendedor"),
        val: val,
        // Pct proporcional a uma meta de faturamento individual de R$ 150.000
        pct: Math.min(Math.round((val / 150000) * 100), 100)
      });
    });
  } catch (err) {
    console.error("[tvHelper] Erro ao mapear dados de vendedores:", err);
  }

  // 2.5. Agenda do mês com quebra por origem (Fase 4 do PLANO_DESENHO_CRM.md)
  //
  // Slide 10 do deck: o SDR e a gestão precisam ver "esses números projetados na
  // TV". Slide 2 pede a quebra Inbound/Outbound. Visita sai do estágio do deal;
  // reunião sai da atividade e resolve a origem pelo `dealId`.
  //
  // `origin` já vem gravado no deal pela CF `onDealParticipantsChanged`, mas
  // aqui recalculamos com `computeOrigin` como rede: um deal ainda não tocado
  // pelo trigger (ou pelo backfill) apareceria sem origem na TV, e a TV não tem
  // ninguém olhando o console para perceber.
  // O canal precisa ter a métrica `agenda_origem` habilitada. O gate fica AQUI,
  // e não só na renderização: um canal sem a permissão não deve nem receber o
  // dado no RTDB (`/public_tv/{token}` é público, basta ter o link), e de
  // quebra a query nem roda.
  const showAgenda = allowed.includes("agenda_origem");
  let agenda: unknown = null;

  if (showAgenda) {
    const VISIT_STAGES = new Set(["visita_agendada", "degustacao_agendada", "degustacao_realizada"]);
    const visitDeals = filteredDeals.filter(d => VISIT_STAGES.has(d.stage));
    const visitsByOrigin = { inbound: 0, outbound: 0, total: visitDeals.length };
    for (const d of visitDeals) {
      if (computeOrigin(d) === "inbound") visitsByOrigin.inbound++;
      else visitsByOrigin.outbound++;
    }

    const dealsById = new Map(deals.map(d => [d.id, d]));
    const meetingsByOrigin = { inbound: 0, outbound: 0, unresolved: 0, total: 0 };
    try {
      // Sem `where('type')` de propósito: combinar type + createdAt exigiria um
      // índice composto novo, e o filtro em memória custa menos que o deploy de
      // índice — é o mesmo padrão do bloco de tarefas diárias abaixo.
      const monthActsSnap = await db.collection(`tenants/${tenantId}/activities`)
        .where("createdAt", ">=", startOfMonth)
        .get();
      const meetings = monthActsSnap.docs
        .map(doc => doc.data() as any)
        .filter(a => a.type === "meeting")
        .filter(a => productId === "all" || a.productId === productId);

      meetingsByOrigin.total = meetings.length;
      for (const a of meetings) {
        const deal = a.dealId ? dealsById.get(a.dealId) : undefined;
        // Sem deal não há como saber a origem — conta à parte em vez de inventar.
        if (!deal) { meetingsByOrigin.unresolved++; continue; }
        if (computeOrigin(deal) === "inbound") meetingsByOrigin.inbound++;
        else meetingsByOrigin.outbound++;
      }
    } catch (err) {
      console.error("[tvHelper] Erro ao computar reuniões por origem:", err);
    }

    agenda = { visits: visitsByOrigin, meetings: meetingsByOrigin };
  }

  // 2.6. Ranking de SDRs (PLANO_DESENHO_CRM_2.md, Fase B)
  //
  // Mesmo gate de `agenda_origem`: o nó `/public_tv/{token}` é público, então um
  // canal sem a métrica `ranking_sdr` não recebe o dado nem dispara as queries.
  // Só entram primeiro nome, iniciais e contagens (ver `rankingSdr.ts`).
  let rankingSdr: SdrRanking | null = null;
  if (allowed.includes("ranking_sdr")) {
    try {
      const monthStartBRT = periodStartsBRT(now).month;
      const [usersSnap, eventsSnap, actsSnap] = await Promise.all([
        db.collection(`tenants/${tenantId}/users`).get(),
        db.collection(`tenants/${tenantId}/sdr_events`).where("at", ">=", monthStartBRT).get(),
        db.collection(`tenants/${tenantId}/activities`).where("createdAt", ">=", monthStartBRT).get(),
      ]);
      const events: SdrEvent[] = [];
      for (const d of eventsSnap.docs) {
        const e = d.data() as any;
        const at = asDate(e.at);
        if (at && e.sdrId && e.kind) events.push({ sdrId: e.sdrId, kind: e.kind, at, productId: e.productId });
      }
      const activities: SdrActivity[] = [];
      for (const d of actsSnap.docs) {
        const a = d.data() as any;
        const createdAt = asDate(a.createdAt);
        if (createdAt && a.userId) {
          activities.push({ userId: a.userId, type: a.type, status: a.status, createdAt, productId: a.productId });
        }
      }
      rankingSdr = buildSdrRanking({
        users: usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any),
        events,
        activities,
        productId,
        now,
      });
    } catch (err) {
      console.error("[tvHelper] Erro ao montar o ranking de SDRs:", err);
    }
  }

  // 3. Progresso de tarefas diárias
  let tasks = { done: 0, total: 0 };
  try {
    const activitiesSnap = await db.collection(`tenants/${tenantId}/activities`)
      .where("createdAt", ">=", startOfToday)
      .get();
    const activities = activitiesSnap.docs.map(doc => doc.data() as any);
    
    // Notas não são tarefa: não entram na contagem da TV (decisão do cliente,
    // 31/08/2026). Vale para as notas do card e para as que o sistema grava
    // sozinho — nenhuma delas representa esforço de cadência.
    const todayActs = activities.filter(a =>
      (productId === "all" || a.productId === productId) &&
      a.status !== "skipped" &&
      a.type !== "note"
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
          // Nó público: a chave NÃO pode ser o uid do usuário, e o nome sai só
          // com o primeiro nome. A TV usa a chave apenas como identificador de lista.
          filteredLb[`p${Object.keys(filteredLb).length + 1}`] = {
            ...val,
            name: firstName(val?.name ?? u.name),
          };
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
    // Validade em epoch ms — é o que a regra do RTDB compara contra `now` pra
    // recusar leitura de um link vencido (PLANO_DESENHO_CRM_2.md, B6). Link
    // gerado antes desta mudança não tem o campo: continua sem expiração
    // aplicada, igual já era (não dá pra impor retroativamente uma validade
    // que nunca foi gravada).
    expiresAtMs: linkData.expiresAtMs ?? null,
    allowedMetrics: allowed,
    productId,
    live_kpis: liveKpis,
    // Agenda do mês com quebra por origem — slide 10 + slide 2 do deck.
    // `null` quando o canal não tem a métrica `agenda_origem`.
    agenda,
    // Ranking de SDRs por período (dia/semana/mês) — `null` sem `ranking_sdr`.
    ranking_sdr: rankingSdr,
    rankingPeriod: linkData.rankingPeriod || "week",
    sellers: sellersList.sort((a, b) => b.val - a.val),
    tasks: tasks,
    leaderboard: leaderboard
  };

  // Salva o snapshot no RTDB no nó de acesso público sem credenciais
  await rtdb.ref(`public_tv/${token}`).set(tvSnapshot);
  console.log(`[tvHelper] Mirror de TV atualizado com sucesso no RTDB para o token ${token} (produto: ${productId})`);
}
