/**
 * contractStatus.test.ts — roda sobre `functions/src/comissoes/contractStatus.ts`.
 * Bateria idêntica em `src/features/deals/contractStatus.test.ts`, sobre a
 * cópia do front — se as duas divergirem, uma das duas quebra.
 */
import { describe, it, expect } from "vitest";
import { isComodato, hasContract, isContractPaid, isPendingValidation, contractStatus } from "./contractStatus";

const contrato = { url: "https://x" };

const comodato = (over: Record<string, unknown> = {}) => ({
  mainProduct: "smartcafe_comodato",
  ...over,
});

describe("isComodato", () => {
  it("só o SKU smartcafe_comodato", () => {
    expect(isComodato(comodato())).toBe(true);
    expect(isComodato(comodato({ mainProduct: "wizmart_minimercado" }))).toBe(false);
    expect(isComodato(comodato({ mainProduct: undefined }))).toBe(false);
  });
});

describe("hasContract / isContractPaid", () => {
  it("sem contract nenhum", () => {
    const d = comodato();
    expect(hasContract(d)).toBe(false);
    expect(isContractPaid(d)).toBe(false);
  });

  it("com contrato anexado, ainda não pago", () => {
    const d = comodato({ contract: contrato });
    expect(hasContract(d)).toBe(true);
    expect(isContractPaid(d)).toBe(false);
  });

  it("pago", () => {
    const d = comodato({ contract: contrato, contractPaidAt: new Date() });
    expect(isContractPaid(d)).toBe(true);
  });

  it("contract sem url não conta como anexado (upload incompleto)", () => {
    expect(hasContract(comodato({ contract: { url: "" } }))).toBe(false);
  });
});

describe("isPendingValidation — a condição do e-mail do dia 09 e da fila do financeiro", () => {
  it("não é comodato → nunca pendente, mesmo com contrato e sem pagamento", () => {
    const d = comodato({ mainProduct: "wizmart_minimercado", contract: contrato });
    expect(isPendingValidation(d)).toBe(false);
  });

  it("comodato sem contrato → não pendente (nada para validar ainda)", () => {
    expect(isPendingValidation(comodato())).toBe(false);
  });

  it("comodato com contrato e sem pagamento → pendente", () => {
    expect(isPendingValidation(comodato({ contract: contrato }))).toBe(true);
  });

  it("comodato com contrato já pago → não pendente", () => {
    expect(isPendingValidation(comodato({ contract: contrato, contractPaidAt: new Date() }))).toBe(false);
  });
});

describe("contractStatus", () => {
  it("nao_aplica para outros SKUs", () => {
    expect(contractStatus(comodato({ mainProduct: "wizmart_minimercado" }))).toBe("nao_aplica");
  });
  it("sem_contrato", () => {
    expect(contractStatus(comodato())).toBe("sem_contrato");
  });
  it("pendente", () => {
    expect(contractStatus(comodato({ contract: contrato }))).toBe("pendente");
  });
  it("pago", () => {
    expect(contractStatus(comodato({ contract: contrato, contractPaidAt: new Date() }))).toBe("pago");
  });
});
