import { describe, it, expect, vi } from "vitest";
import { listActiveTenantIds } from "./tenants";

/** Fabrica um doc fake com o mesmo formato de `tenants/{tid}/users/{uid}`. */
function fakeUserDoc(tenantId: string, uid: string) {
  const tenantRef = { id: tenantId };
  const usersCollection = { parent: tenantRef };
  return { ref: { parent: usersCollection } as any };
}

describe("listActiveTenantIds", () => {
  it("deriva o tenantId a partir do documento pai da subcoleção users", async () => {
    const db: any = {
      collectionGroup: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          docs: [fakeUserDoc("wizmart_sp", "u1"), fakeUserDoc("wizmart_sp", "u2")],
        }),
      }),
    };
    const ids = await listActiveTenantIds(db);
    expect(ids).toEqual(["wizmart_sp"]);
    expect(db.collectionGroup).toHaveBeenCalledWith("users");
  });

  it("deduplica múltiplos usuários do mesmo tenant", async () => {
    const db: any = {
      collectionGroup: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          docs: [
            fakeUserDoc("tenant-a", "u1"),
            fakeUserDoc("tenant-a", "u2"),
            fakeUserDoc("tenant-b", "u3"),
          ],
        }),
      }),
    };
    const ids = await listActiveTenantIds(db);
    expect(ids.sort()).toEqual(["tenant-a", "tenant-b"]);
  });

  it("sem nenhum usuário em lugar nenhum, devolve lista vazia (não quebra o cron)", async () => {
    const db: any = {
      collectionGroup: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ docs: [] }),
      }),
    };
    expect(await listActiveTenantIds(db)).toEqual([]);
  });

  it("ignora doc sem tenant pai (defesa, não deveria acontecer na prática)", async () => {
    const db: any = {
      collectionGroup: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          docs: [{ ref: { parent: { parent: null } } }, fakeUserDoc("wizmart_sp", "u1")],
        }),
      }),
    };
    expect(await listActiveTenantIds(db)).toEqual(["wizmart_sp"]);
  });
});
