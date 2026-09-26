import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";

/**
 * The real product catalogue behind the marketplace — distinct from the
 * static curated VENDORS list in marketplace.ts. A product belongs to a
 * vendor (by id, matched loosely against marketplace.ts's static vendors —
 * there's no real supplier-account system yet, so products are added by
 * platform admins on a vendor's behalf; see PHASE2_BUILD_PLAN.md Stage 4 for
 * the still-deferred supplier self-service flow). Same Postgres-with-
 * in-memory-fallback pattern as every other store in this codebase.
 */
export interface ProductRecord {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  specs?: Record<string, string>;
  priceNote?: string;
  createdAt: string;
}

export interface ProductDocumentMeta {
  id: string;
  productId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  hasExtractedText: boolean;
}

interface StoredDocument {
  meta: ProductDocumentMeta;
  data: Buffer;
  extractedText?: string;
}

const memoryProducts = new Map<string, ProductRecord>();
const memoryDocuments = new Map<string, StoredDocument>(); // key: document id

function matchesQuery(haystack: (string | undefined)[], q: string): boolean {
  const needle = q.toLowerCase();
  return haystack.some((h) => h?.toLowerCase().includes(needle));
}

export async function createProduct(input: Omit<ProductRecord, "id" | "createdAt">): Promise<ProductRecord> {
  const product: ProductRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
  if (!isDbConfigured()) {
    memoryProducts.set(product.id, product);
    return product;
  }
  const prisma = getPrisma()!;
  await prisma.product.create({
    data: {
      id: product.id,
      vendorId: product.vendorId,
      name: product.name,
      category: product.category,
      summary: product.summary,
      description: product.description,
      specs: (product.specs ?? undefined) as Prisma.InputJsonValue | undefined,
      priceNote: product.priceNote,
      createdAt: new Date(product.createdAt),
    },
  });
  return product;
}

function fromProductRow(row: {
  id: string; vendorId: string; name: string; category: string; summary: string;
  description: string; specs: unknown; priceNote: string | null; createdAt: Date;
}): ProductRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    name: row.name,
    category: row.category,
    summary: row.summary,
    description: row.description,
    specs: (row.specs as Record<string, string> | null) ?? undefined,
    priceNote: row.priceNote ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ProductFilter {
  category?: string;
  q?: string;
  vendorId?: string;
}

/**
 * Search across the catalogue — the closest thing to "Google for renewable
 * products" this phase ships: Postgres ILIKE across product fields AND the
 * extracted text of every uploaded manual/spec sheet (in-memory: plain
 * substring matching over the same fields). Deliberately not vector/semantic
 * search — at this catalogue size, ILIKE-across-manuals is honestly
 * sufficient and adds no new infrastructure; upgrading to embeddings-based
 * search is a documented future step once the catalogue outgrows this
 * (mirrors the Hetzner-deferral pattern in PHASE2_BUILD_PLAN.md).
 */
export async function listProducts(filter: ProductFilter = {}): Promise<ProductRecord[]> {
  const { category, q, vendorId } = filter;
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.product.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(vendorId ? { vendorId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { summary: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { documents: { some: { extractedText: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(fromProductRow);
  }

  let products = [...memoryProducts.values()];
  if (category) products = products.filter((p) => p.category === category);
  if (vendorId) products = products.filter((p) => p.vendorId === vendorId);
  if (q) {
    const docTextByProduct = new Map<string, string[]>();
    for (const doc of memoryDocuments.values()) {
      if (!doc.extractedText) continue;
      const list = docTextByProduct.get(doc.meta.productId) ?? [];
      list.push(doc.extractedText);
      docTextByProduct.set(doc.meta.productId, list);
    }
    products = products.filter((p) =>
      matchesQuery([p.name, p.summary, p.description, ...(docTextByProduct.get(p.id) ?? [])], q),
    );
  }
  return products.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(id: string): Promise<ProductRecord | undefined> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const row = await prisma.product.findUnique({ where: { id } });
    return row ? fromProductRow(row) : undefined;
  }
  return memoryProducts.get(id);
}

/** Marketplace administration — removes a listing (and its documents; the
 * Postgres schema cascades ProductDocument on Product delete, mirrored here
 * for the in-memory fallback since a plain Map has no such thing). */
export async function deleteProduct(id: string): Promise<boolean> {
  if (!isDbConfigured()) {
    if (!memoryProducts.has(id)) return false;
    memoryProducts.delete(id);
    for (const [docId, doc] of memoryDocuments) {
      if (doc.meta.productId === id) memoryDocuments.delete(docId);
    }
    return true;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.product.delete({ where: { id } });
  return true;
}

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB — generous for a manual/spec-sheet PDF, small enough to store as a DB blob without real object storage.

export class DocumentTooLargeError extends Error {
  constructor() {
    super(`Documents must be ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB or smaller`);
    this.name = "DocumentTooLargeError";
  }
}

export class UnsupportedDocumentTypeError extends Error {
  constructor() {
    super("Only PDF and plain-text documents are supported right now");
    this.name = "UnsupportedDocumentTypeError";
  }
}

/** Only ever called with a type addProductDocument has already validated
 * (text/plain or application/pdf), so no third fallback branch here. */
async function extractText(mimeType: string, data: Buffer): Promise<string | undefined> {
  if (mimeType === "text/plain") return data.toString("utf-8");
  let parser: import("pdf-parse").PDFParse | undefined;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data });
    const result = await parser.getText();
    return result.text?.trim() || undefined;
  } catch {
    return undefined; // corrupt/unreadable PDF — the file itself is still stored and downloadable.
  } finally {
    await parser?.destroy();
  }
}

/** Uploads a product manual/spec sheet: validates type/size, extracts text
 * (best-effort) so the AI can answer questions grounded in it, and stores
 * the raw bytes as a DB blob — no object-storage vendor added for this
 * phase's catalogue size (see MAX_DOCUMENT_BYTES). */
export async function addProductDocument(
  productId: string,
  file: { filename: string; mimeType: string; data: Buffer },
): Promise<ProductDocumentMeta> {
  if (file.data.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentTooLargeError();
  if (file.mimeType !== "application/pdf" && file.mimeType !== "text/plain") {
    throw new UnsupportedDocumentTypeError();
  }

  const extractedText = await extractText(file.mimeType, file.data);
  const meta: ProductDocumentMeta = {
    id: randomUUID(),
    productId,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.data.byteLength,
    createdAt: new Date().toISOString(),
    hasExtractedText: Boolean(extractedText),
  };

  if (!isDbConfigured()) {
    memoryDocuments.set(meta.id, { meta, data: file.data, extractedText });
    return meta;
  }
  const prisma = getPrisma()!;
  await prisma.productDocument.create({
    data: {
      id: meta.id,
      productId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      data: new Uint8Array(file.data),
      extractedText,
      createdAt: new Date(meta.createdAt),
    },
  });
  return meta;
}

export async function listProductDocuments(productId: string): Promise<ProductDocumentMeta[]> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.productDocument.findMany({
      where: { productId },
      select: { id: true, productId: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true, extractedText: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id, productId: r.productId, filename: r.filename, mimeType: r.mimeType,
      sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), hasExtractedText: Boolean(r.extractedText),
    }));
  }
  return [...memoryDocuments.values()]
    .filter((d) => d.meta.productId === productId)
    .map((d) => d.meta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProductDocument(docId: string): Promise<{ meta: ProductDocumentMeta; data: Buffer } | undefined> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const row = await prisma.productDocument.findUnique({ where: { id: docId } });
    if (!row) return undefined;
    return {
      meta: {
        id: row.id, productId: row.productId, filename: row.filename, mimeType: row.mimeType,
        sizeBytes: row.sizeBytes, createdAt: row.createdAt.toISOString(), hasExtractedText: Boolean(row.extractedText),
      },
      data: Buffer.from(row.data),
    };
  }
  const doc = memoryDocuments.get(docId);
  return doc ? { meta: doc.meta, data: doc.data } : undefined;
}

/** Text excerpts for AI grounding — never the raw binary, just what was
 * extracted, capped per document so a handful of manuals stay well within a
 * single prompt's context budget. */
export async function getProductDocumentTexts(productId: string, maxCharsPerDoc = 6000): Promise<{ filename: string; text: string }[]> {
  if (isDbConfigured()) {
    const prisma = getPrisma()!;
    const rows = await prisma.productDocument.findMany({
      where: { productId, NOT: { extractedText: null } },
      select: { filename: true, extractedText: true },
    });
    return rows
      .filter((r) => r.extractedText)
      .map((r) => ({ filename: r.filename, text: r.extractedText!.slice(0, maxCharsPerDoc) }));
  }
  return [...memoryDocuments.values()]
    .filter((d) => d.meta.productId === productId && d.extractedText)
    .map((d) => ({ filename: d.meta.filename, text: d.extractedText!.slice(0, maxCharsPerDoc) }));
}
