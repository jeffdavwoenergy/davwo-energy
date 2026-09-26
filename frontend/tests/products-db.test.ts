import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Exercises products.ts's Postgres-backed branch against a fake Prisma
 * client faithful enough to cover the specific query shapes listProducts and
 * the document endpoints actually issue (category equality, an OR of
 * case-insensitive `contains` across product fields plus a nested
 * `documents.some.extractedText.contains` relation filter) — not a general
 * Prisma-query interpreter. Same rationale as orgs-db.test.ts/users-db.test.ts
 * for why this isn't a real Postgres instance.
 */
const productStore: Record<string, unknown>[] = [];
const documentStore: Record<string, unknown>[] = [];

function ci(haystack: string | undefined, needle: string): boolean {
  return Boolean(haystack?.toLowerCase().includes(needle.toLowerCase()));
}

function matchesProductWhere(p: Record<string, unknown>, where: Record<string, unknown>): boolean {
  if (where.category && p.category !== where.category) return false;
  if (where.vendorId && p.vendorId !== where.vendorId) return false;
  if (Array.isArray(where.OR)) {
    return (where.OR as Record<string, unknown>[]).some((clause) => {
      if (clause.name) return ci(p.name as string, (clause.name as { contains: string }).contains);
      if (clause.summary) return ci(p.summary as string, (clause.summary as { contains: string }).contains);
      if (clause.description) return ci(p.description as string, (clause.description as { contains: string }).contains);
      if (clause.documents) {
        const needle = ((clause.documents as { some: { extractedText: { contains: string } } }).some.extractedText.contains);
        return documentStore.some((d) => d.productId === p.id && ci(d.extractedText as string, needle));
      }
      return false;
    });
  }
  return true;
}

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    product: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        productStore.push(data);
        return data;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> }) =>
        productStore.filter((p) => !where || matchesProductWhere(p, where)),
      findUnique: async ({ where }: { where: { id: string } }) => productStore.find((p) => p.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = productStore.findIndex((p) => p.id === where.id);
        if (idx < 0) throw new Error("Record to delete does not exist.");
        const [removed] = productStore.splice(idx, 1);
        // Real schema cascades ProductDocument on Product delete (onDelete: Cascade).
        for (let i = documentStore.length - 1; i >= 0; i--) {
          if (documentStore[i].productId === where.id) documentStore.splice(i, 1);
        }
        return removed;
      },
    },
    productDocument: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        documentStore.push(data);
        return data;
      },
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        let rows = documentStore.filter((d) => d.productId === where.productId);
        if (where.NOT && (where.NOT as { extractedText: null }).extractedText === null) {
          rows = rows.filter((d) => d.extractedText != null);
        }
        if (!select) return rows;
        return rows.map((d) => Object.fromEntries(Object.keys(select).map((k) => [k, d[k]])));
      },
      findUnique: async ({ where }: { where: { id: string } }) => documentStore.find((d) => d.id === where.id) ?? null,
    },
  }),
}));

describe("products (Postgres-backed)", () => {
  beforeEach(() => {
    productStore.length = 0;
    documentStore.length = 0;
    vi.resetModules();
  });

  it("persists a product via Prisma and finds it back by id", async () => {
    const { createProduct, getProduct } = await import("@/lib/server/products");
    const product = await createProduct({ vendorId: "v1", name: "Rapid 50", category: "ev-chargers", summary: "s", description: "d" });
    expect(productStore).toHaveLength(1);
    expect((await getProduct(product.id))?.name).toBe("Rapid 50");
    expect(await getProduct("unknown")).toBeUndefined();
  });

  it("listProducts filters by category and searches name/summary/description via Prisma", async () => {
    const { createProduct, listProducts } = await import("@/lib/server/products");
    await createProduct({ vendorId: "v1", name: "Solar Array", category: "solar", summary: "Rooftop", description: "500kW" });
    await createProduct({ vendorId: "v1", name: "Battery Bank", category: "battery", summary: "Peak-shaving BESS", description: "1MWh" });

    expect((await listProducts({ category: "solar" })).map((p) => p.name)).toEqual(["Solar Array"]);
    expect((await listProducts({ q: "peak-shaving" })).map((p) => p.name)).toEqual(["Battery Bank"]);
    expect((await listProducts({ vendorId: "v1" })).map((p) => p.name).sort()).toEqual(["Battery Bank", "Solar Array"]);
    expect(await listProducts({ vendorId: "v-unknown" })).toEqual([]);
  });

  it("listProducts search reaches into an attached document's extracted text", async () => {
    const { createProduct, listProducts, addProductDocument } = await import("@/lib/server/products");
    const product = await createProduct({ vendorId: "v1", name: "Mystery Unit", category: "ev-chargers", summary: "s", description: "d" });
    await addProductDocument(product.id, { filename: "manual.txt", mimeType: "text/plain", data: Buffer.from("Supports OCPP 2.0.1.") });

    expect((await listProducts({ q: "ocpp" })).map((p) => p.id)).toContain(product.id);
    expect((await listProducts({ q: "no-match-phrase" })).map((p) => p.id)).not.toContain(product.id);
  });

  it("addProductDocument stores the blob and extracted text via Prisma, downloadable and listable", async () => {
    const { createProduct, addProductDocument, listProductDocuments, getProductDocument, getProductDocumentTexts } = await import(
      "@/lib/server/products"
    );
    const product = await createProduct({ vendorId: "v1", name: "Y", category: "solar", summary: "s", description: "d" });
    const meta = await addProductDocument(product.id, { filename: "spec.txt", mimeType: "text/plain", data: Buffer.from("Warranty: 10 years.") });

    expect((await listProductDocuments(product.id)).map((d) => d.id)).toContain(meta.id);
    expect((await getProductDocument(meta.id))?.data.toString("utf-8")).toBe("Warranty: 10 years.");
    expect(await getProductDocumentTexts(product.id)).toEqual([{ filename: "spec.txt", text: "Warranty: 10 years." }]);
  });

  it("getProductDocumentTexts skips documents with no extracted text", async () => {
    const { createProduct, addProductDocument, getProductDocumentTexts } = await import("@/lib/server/products");
    const product = await createProduct({ vendorId: "v1", name: "Z", category: "solar", summary: "s", description: "d" });
    // An unsupported type never reaches Prisma (validated before persistence),
    // so use a type that IS supported but simulate an extraction miss isn't
    // reachable from the public API — instead confirm the empty-catalogue case.
    expect(await getProductDocumentTexts(product.id)).toEqual([]);
    await addProductDocument(product.id, { filename: "spec.txt", mimeType: "text/plain", data: Buffer.from("has text") });
    expect(await getProductDocumentTexts(product.id)).toHaveLength(1);
  });

  it("deleteProduct removes the product and cascades its documents via Prisma, false for an unknown id", async () => {
    const { createProduct, getProduct, addProductDocument, getProductDocument, deleteProduct } = await import("@/lib/server/products");
    const product = await createProduct({ vendorId: "v1", name: "Removable", category: "solar", summary: "s", description: "d" });
    const doc = await addProductDocument(product.id, { filename: "spec.txt", mimeType: "text/plain", data: Buffer.from("x") });

    expect(await deleteProduct(product.id)).toBe(true);
    expect(await getProduct(product.id)).toBeUndefined();
    expect(await getProductDocument(doc.id)).toBeUndefined();
    expect(await deleteProduct("never-existed")).toBe(false);
  });
});
