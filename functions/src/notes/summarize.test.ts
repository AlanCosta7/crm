import { describe, it, expect } from "vitest";
import { markdownToPlainText, summarize } from "./onNoteWritten";

describe("markdownToPlainText", () => {
  it("remove a marcação e colapsa espaços", () => {
    const md = "## Reunião\n\nCliente pediu **desconto** de _10%_ e o [contrato](https://x.com).";
    expect(markdownToPlainText(md)).toBe("Reunião Cliente pediu desconto de 10% e o contrato.");
  });

  it("remove bloco de código, citação e checklist", () => {
    expect(markdownToPlainText("```\nvar x\n```\n> nota\n- [ ] ligar")).toBe("nota ligar");
  });

  it("aguenta corpo vazio ou nulo", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(undefined as unknown as string)).toBe("");
  });
});

describe("summarize", () => {
  it("devolve o texto inteiro quando cabe", () => {
    expect(summarize("nota curta")).toBe("nota curta");
  });

  it("trunca no limite com reticências", () => {
    const out = summarize("a".repeat(400));
    expect(out.length).toBeLessThanOrEqual(283);
    expect(out.endsWith("...")).toBe(true);
  });

  it("corta em limite de palavra quando possível", () => {
    const texto = `${"palavra ".repeat(40)}fim`;
    const out = summarize(texto, 50);
    expect(out.endsWith("...")).toBe(true);
    expect(out).not.toMatch(/palav\.\.\.$/); // não corta no meio da palavra
  });

  it("corta no limite exato quando não há espaço utilizável", () => {
    const out = summarize("x".repeat(100), 20);
    expect(out).toBe(`${"x".repeat(20)}...`);
  });
});
