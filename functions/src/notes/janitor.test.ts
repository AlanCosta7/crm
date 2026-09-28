import { describe, it, expect } from "vitest";
import {
  parseAttachmentPath,
  isOrphanPrefix,
  MIN_ORPHAN_AGE_MS,
} from "./janitorNoteAttachments";

describe("parseAttachmentPath", () => {
  it("extrai tenant e nota de um caminho de anexo", () => {
    expect(parseAttachmentPath("tenants/wizmart/notes/n1/att1/proposta.pdf")).toEqual({
      tenantId: "wizmart",
      noteId: "n1",
    });
  });

  it("reconhece a miniatura, que fica no mesmo prefixo", () => {
    expect(parseAttachmentPath("tenants/wizmart/notes/n1/att1/thumb.webp")).toEqual({
      tenantId: "wizmart",
      noteId: "n1",
    });
  });

  it("ignora caminho de outra área do bucket", () => {
    expect(parseAttachmentPath("tenants/wizmart/outra-coisa/x.pdf")).toBeNull();
    expect(parseAttachmentPath("qualquer/coisa.pdf")).toBeNull();
    expect(parseAttachmentPath("")).toBeNull();
  });
});

describe("isOrphanPrefix", () => {
  const agora = Date.parse("2026-08-31T12:00:00Z");
  const horas = (h: number) => agora - h * 60 * 60 * 1000;

  it("nunca apaga prefixo de nota existente, por mais antigo que seja", () => {
    expect(isOrphanPrefix(true, horas(1000), agora)).toBe(false);
  });

  it("apaga prefixo sem nota depois da janela de 48h", () => {
    expect(isOrphanPrefix(false, horas(72), agora)).toBe(true);
  });

  it("poupa arquivo recém-enviado — pode ser rascunho em andamento", () => {
    expect(isOrphanPrefix(false, horas(1), agora)).toBe(false);
    expect(isOrphanPrefix(false, horas(47), agora)).toBe(false);
  });

  it("apaga exatamente no limite da janela", () => {
    expect(isOrphanPrefix(false, agora - MIN_ORPHAN_AGE_MS, agora)).toBe(true);
  });

  it("trata data ausente (0) como antiga, não como recente", () => {
    expect(isOrphanPrefix(false, 0, agora)).toBe(true);
  });

  it("respeita janela customizada", () => {
    expect(isOrphanPrefix(false, horas(2), agora, 60 * 60 * 1000)).toBe(true);
    expect(isOrphanPrefix(false, horas(2), agora, 10 * 60 * 60 * 1000)).toBe(false);
  });
});
