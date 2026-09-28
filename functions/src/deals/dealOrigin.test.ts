import { describe, it, expect } from "vitest";
import { computeOrigin, originLabel } from "./dealOrigin";

describe("computeOrigin", () => {
  it("leadOrigin presente é inbound — o sinal mais forte", () => {
    expect(computeOrigin({ leadOrigin: { leadId: "l1", sourceId: "s1", sourceName: "LP" } })).toBe("inbound");
  });

  it("leadOrigin vence funnelType outbound (fonte pública tem prioridade)", () => {
    expect(computeOrigin({ leadOrigin: { leadId: "l1" }, funnelType: "outbound" })).toBe("inbound");
  });

  it("funnelType inbound dos funis legados é respeitado", () => {
    expect(computeOrigin({ funnelType: "inbound" })).toBe("inbound");
  });

  it("funnelType outbound dos funis legados é respeitado", () => {
    expect(computeOrigin({ funnelType: "outbound" })).toBe("outbound");
  });

  it("funil unificado ('main') sem leadOrigin cai em outbound", () => {
    expect(computeOrigin({ funnelType: "main" })).toBe("outbound");
  });

  it("funil hunter sem leadOrigin cai em outbound", () => {
    expect(computeOrigin({ funnelType: "hunter" })).toBe("outbound");
  });

  it("deal sem nenhum sinal é outbound (card criado à mão pelo time)", () => {
    expect(computeOrigin({})).toBe("outbound");
  });

  // Segurança: a função ignora de propósito o `origin` já no documento. Sem
  // isso, um deal criado pela UI com `origin: 'inbound'` no payload manteria a
  // mentira (a rule bloqueia reescrita em update, mas não o valor no create).
  it("IGNORA origin forjado no payload e recalcula pelos sinais confiáveis", () => {
    expect(computeOrigin({ origin: "inbound" } as never)).toBe("outbound");
    expect(computeOrigin({ funnelType: "main", origin: "inbound" } as never)).toBe("outbound");
  });

  it("é determinística: o mesmo deal sempre dá o mesmo resultado", () => {
    const deal = { funnelType: "main" as const };
    expect(computeOrigin(deal)).toBe(computeOrigin(deal));
  });

  it("leadOrigin não-objeto não conta como inbound", () => {
    expect(computeOrigin({ leadOrigin: "sim" })).toBe("outbound");
    expect(computeOrigin({ leadOrigin: null })).toBe("outbound");
  });

  // Um deal de LP que o SDR moveu para o funil unificado continua inbound:
  // é exatamente o caso do slide 1 ("os leads da LP aceitam visita direto").
  it("lead de LP migrado para o funil main permanece inbound", () => {
    expect(computeOrigin({
      leadOrigin: { leadId: "l1", sourceId: "lp-wizmart", sourceName: "Landing Page" },
      funnelType: "main",
    })).toBe("inbound");
  });
});

describe("originLabel", () => {
  it("usa os rótulos do deck", () => {
    expect(originLabel("inbound")).toBe("Inbound");
    expect(originLabel("outbound")).toBe("Outbound");
  });
});
