import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Postgres-backed branches of products.ts (demo listings, listing edits,
 * photo gallery), suppliers.ts (demo seeding, profile + password updates) and
 * accountLinks.ts — against a small fake Prisma client covering just the
 * query shapes those functions issue (same approach as products-db.test.ts).
 */
type Row = Record<string, unknown>;
const products: Row[] = [];
const images: Row[] = [];
const suppliers: Row[] = [];
const links: Row[] = [];
const failNext = { productCreate: false, supplierCreate: null as Error | null };

const byKey = (rows: Row[], where: Row) => {
  const [k, v] = Object.entries(where)[0];
  return rows.find((r) => r[k] === v) ?? null;
};

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    product: {
      findUnique: async ({ where }: { where: Row }) => {
        const p = byKey(products, where);
        return p && { ...p, images: images.filter((i) => i.productId === p.id) };
      },
      findMany: async () => products.map((p) => ({ ...p, images: images.filter((i) => i.productId === p.id) })),
      create: async ({ data }: { data: Row }) => {
        if (failNext.productCreate) {
          failNext.productCreate = false;
          throw new Error("db down");
        }
        products.push({ priceNote: null, ...data });
        return data;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const p = products.find((x) => x.id === where.id)!;
        // Prisma.DbNull is written as SQL NULL and read back as null.
        for (const [k, v] of Object.entries(data)) p[k] = v && typeof v === "object" && /Null/.test(v.constructor?.name ?? "") ? null : v;
        return { ...p, images: images.filter((i) => i.productId === p.id) };
      },
    },
    productImage: {
      findMany: async ({ where }: { where: { productId: string } }) =>
        images.filter((i) => i.productId === where.productId).sort((a, b) => (b.position as number) - (a.position as number)),
      create: async ({ data }: { data: Row }) => { images.push(data); return data; },
      findUnique: async ({ where }: { where: { id: string } }) => byKey(images, where),
      delete: async ({ where }: { where: { id: string } }) => images.splice(images.findIndex((i) => i.id === where.id), 1)[0],
    },
    supplier: {
      findUnique: async ({ where }: { where: Row }) => byKey(suppliers, where),
      create: async ({ data }: { data: Row }) => {
        if (failNext.supplierCreate) {
          const e = failNext.supplierCreate;
          failNext.supplierCreate = null;
          throw e;
        }
        const row = { region: null, website: null, createdAt: new Date(), ...data };
        suppliers.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const s = suppliers.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      },
    },
    accountLink: {
      deleteMany: ({ where }: { where: { OR: Row[] } }) => ({ op: "deleteMany", where }),
      create: ({ data }: { data: Row }) => ({ op: "create", data }),
      findUnique: async ({ where }: { where: Row }) => byKey(links, where),
    },
    $transaction: async (ops: { op: string; where?: { OR: Row[] }; data?: Row }[]) => {
      for (const o of ops) {
        if (o.op === "deleteMany") {
          for (let i = links.length - 1; i >= 0; i--) {
            if (o.where!.OR.some((c) => Object.entries(c).every(([k, v]) => links[i][k] === v))) links.splice(i, 1);
          }
        } else links.push(o.data!);
      }
    },
  }),
}));

beforeEach(() => {
  for (const a of [products, images, suppliers, links]) a.length = 0;
  vi.resetModules();
  process.env.ALLOW_DEMO_LOGIN = "true";
});
afterEach(() => { delete process.env.ALLOW_DEMO_LOGIN; });

describe("products (Postgres) — demo listings, edits and photos", () => {
  it("seeds the demo listings once on a demo deployment, and retries after a failed seed", async () => {
    const p = await import("@/lib/server/products");
    failNext.productCreate = true;
    await expect(p.listProducts()).rejects.toThrow("db down");
    await p.listProducts();
    await p.listProducts();
    expect(products.map((x) => x.id).sort()).toEqual(p.DEMO_PRODUCTS.map((x) => x.id).sort());
  });

  it("doesn't seed demo listings into a real (non-demo) database", async () => {
    delete process.env.ALLOW_DEMO_LOGIN;
    const p = await import("@/lib/server/products");
    await p.listProducts();
    expect(products).toHaveLength(0);
  });

  it("updateProduct patches fields and clears JSON columns; unknown ids are undefined", async () => {
    const p = await import("@/lib/server/products");
    const id = p.DEMO_PRODUCTS[0].id;
    expect(await p.updateProduct("nope", { name: "x" })).toBeUndefined();
    const updated = await p.updateProduct(id, {
      name: "Renamed", category: "solar", summary: "s", description: "d", specs: undefined, priceNote: undefined, listing: undefined,
    });
    expect(updated).toMatchObject({ id, name: "Renamed", category: "solar", specs: undefined, listing: undefined, priceNote: undefined });
    const row = products.find((x) => x.id === id)!;
    expect(row.specs).toBeNull();
    expect(row.listing).toBeNull();
  });

  it("photos: positions increase, the gallery is capped, and deletes are scoped to the product", async () => {
    const p = await import("@/lib/server/products");
    await p.listProducts();
    const pid = p.DEMO_PRODUCTS[0].id;
    const file = { mimeType: "image/png", data: Buffer.from([1, 2, 3]) };
    const ids: string[] = [];
    for (let i = 0; i < p.MAX_PRODUCT_IMAGES; i++) ids.push((await p.addProductImage(pid, file)).id);
    expect(images.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5]);
    await expect(p.addProductImage(pid, file)).rejects.toBeInstanceOf(p.TooManyImagesError);

    expect(await p.getProductImage(ids[0])).toMatchObject({ productId: pid, mimeType: "image/png" });
    expect(await p.getProductImage("missing")).toBeUndefined();
    expect((await p.getProduct(pid))?.imageIds).toHaveLength(6);
    expect(await p.deleteProductImage("other-product", ids[0])).toBe(false);
    expect(await p.deleteProductImage(pid, ids[0])).toBe(true);
    expect(images).toHaveLength(5);
  });
});

describe("suppliers (Postgres) — demo seeding, profile and password", () => {
  it("seeding tolerates a concurrent instance winning the insert, and retries after other errors", async () => {
    const { Prisma } = await import("@prisma/client");
    const s = await import("@/lib/server/suppliers");
    failNext.supplierCreate = new Error("db down");
    await expect(s.findSupplierByEmail("admin@davwo.com")).rejects.toThrow("db down");
    failNext.supplierCreate = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    await s.findSupplierByEmail("admin@davwo.com");
    // The duplicate row "belonged to another instance"; the rest were seeded.
    expect(suppliers.length).toBe(s.DEMO_SUPPLIERS.length - 1);
  });

  it("updates the profile and password in the database", async () => {
    const s = await import("@/lib/server/suppliers");
    const sup = await s.registerSupplier({ email: "a@co.example", password: "password123", companyName: "A Co", category: "solar" });
    expect(await s.updateSupplierProfile("nope", { companyName: "x" })).toBeUndefined();
    const u = await s.updateSupplierProfile(sup.id, { companyName: "A Co Ltd", region: "", website: "https://a.example" });
    expect(u).toMatchObject({ companyName: "A Co Ltd", website: "https://a.example" });
    expect(u?.region).toBeUndefined();

    await s.changeSupplierPassword(sup.id, "password123", "newpassword456");
    await expect(s.authenticateSupplier("a@co.example", "newpassword456")).resolves.toMatchObject({ id: sup.id });
  });
});

describe("account links (Postgres)", () => {
  it("links, re-links either side, and looks up both directions", async () => {
    const a = await import("@/lib/server/accountLinks");
    await a.linkAccounts("u1", "s1");
    expect(await a.linkedSupplierFor("u1")).toBe("s1");
    expect(await a.linkedUserFor("s1")).toBe("u1");
    await a.linkAccounts("u1", "s2"); // re-link replaces u1's old link
    expect(links).toEqual([{ userId: "u1", supplierId: "s2" }]);
    expect(await a.linkedUserFor("s1")).toBeUndefined();
    expect(await a.linkedSupplierFor("u-nobody")).toBeUndefined();
    // Demo pairs are fixed, no DB needed.
    expect(await a.linkedSupplierFor("u-admin")).toBe("s-davwo");
  });
});
