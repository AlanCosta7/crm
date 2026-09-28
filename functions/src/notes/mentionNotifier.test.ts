import { describe, it, expect } from "vitest";
import { resolveMentionRecipients, buildMentionBody } from "./mentionNotifier";

const ativos = ["sdr-001", "rep-001", "manager-001", "bdr-001"];

describe("resolveMentionRecipients", () => {
  it("nota nova notifica todos os mencionados", () => {
    expect(
      resolveMentionRecipients({
        current: ["rep-001", "manager-001"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual(["rep-001", "manager-001"]);
  });

  it("edição notifica só quem entrou agora", () => {
    expect(
      resolveMentionRecipients({
        previous: ["rep-001"],
        current: ["rep-001", "bdr-001"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual(["bdr-001"]);
  });

  it("reeditar sem mexer nas menções não notifica ninguém", () => {
    expect(
      resolveMentionRecipients({
        previous: ["rep-001"],
        current: ["rep-001"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual([]);
  });

  it("nunca notifica o próprio autor", () => {
    expect(
      resolveMentionRecipients({
        current: ["sdr-001", "rep-001"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual(["rep-001"]);
  });

  it("descarta uid que não existe ou está inativo", () => {
    expect(
      resolveMentionRecipients({
        current: ["rep-001", "desligado-001", "inventado"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual(["rep-001"]);
  });

  it("não notifica duas vezes quem aparece repetido", () => {
    expect(
      resolveMentionRecipients({
        current: ["rep-001", "rep-001"],
        authorId: "sdr-001",
        activeUids: ativos,
      })
    ).toEqual(["rep-001"]);
  });

  it("nota sem menção não gera destinatário", () => {
    expect(
      resolveMentionRecipients({ current: [], authorId: "sdr-001", activeUids: ativos })
    ).toEqual([]);
  });
});

describe("buildMentionBody", () => {
  it("diz quem mencionou, onde e mostra o trecho", () => {
    expect(buildMentionBody("João SDR", "Mercado Central", "Cliente pediu proposta revisada")).toBe(
      "João SDR em Mercado Central: Cliente pediu proposta revisada"
    );
  });

  it("omite o local quando o destinatário não pode ver o deal", () => {
    expect(buildMentionBody("João SDR", "", "Cliente pediu proposta")).toBe(
      "João SDR: Cliente pediu proposta"
    );
  });

  it("trunca trecho longo", () => {
    const out = buildMentionBody("João", "Deal", "a".repeat(300));
    expect(out.length).toBeLessThan(160);
    expect(out.endsWith("...")).toBe(true);
  });

  it("nota só com anexo (sem texto) tem corpo legível", () => {
    expect(buildMentionBody("João SDR", "Mercado Central", "")).toBe(
      "João SDR mencionou você em Mercado Central."
    );
  });
});
