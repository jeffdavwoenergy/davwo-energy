import { randomUUID } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";

/**
 * Per-product technical support knowledgebase — known issues and their
 * documented resolutions, added by the platform team or the supplier who
 * owns the product (same ownership model as ProductDocument). This is what
 * lets ANI answer support questions with an actual fix instead of a guess:
 * askAboutProducts (productQA.ts) grounds its answer in these entries the
 * same way it grounds spec answers in uploaded manuals. Same Postgres-with-
 * in-memory-fallback pattern as every other store in this codebase.
 */
export interface KnowledgeBaseEntry {
  id: string;
  productId: string;
  issue: string;
  symptoms?: string;
  resolution: string;
  createdAt: string;
}

export interface NewKnowledgeBaseEntryInput {
  issue: string;
  symptoms?: string;
  resolution: string;
}

const memoryEntries = new Map<string, KnowledgeBaseEntry[]>(); // key: productId

function fromRow(row: {
  id: string; productId: string; issue: string; symptoms: string | null; resolution: string; createdAt: Date;
}): KnowledgeBaseEntry {
  return {
    id: row.id,
    productId: row.productId,
    issue: row.issue,
    symptoms: row.symptoms ?? undefined,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function addKnowledgeBaseEntry(productId: string, input: NewKnowledgeBaseEntryInput): Promise<KnowledgeBaseEntry> {
  const entry: KnowledgeBaseEntry = {
    id: randomUUID(),
    productId,
    issue: input.issue,
    symptoms: input.symptoms,
    resolution: input.resolution,
    createdAt: new Date().toISOString(),
  };

  if (!isDbConfigured()) {
    const list = memoryEntries.get(productId) ?? [];
    list.push(entry);
    memoryEntries.set(productId, list);
    return entry;
  }
  const prisma = getPrisma()!;
  await prisma.knowledgeBaseEntry.create({
    data: { id: entry.id, productId, issue: entry.issue, symptoms: entry.symptoms, resolution: entry.resolution },
  });
  return entry;
}

export async function listKnowledgeBaseEntries(productId: string): Promise<KnowledgeBaseEntry[]> {
  if (!isDbConfigured()) {
    return [...(memoryEntries.get(productId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const prisma = getPrisma()!;
  const rows = await prisma.knowledgeBaseEntry.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });
  return rows.map(fromRow);
}

export async function removeKnowledgeBaseEntry(productId: string, entryId: string): Promise<boolean> {
  if (!isDbConfigured()) {
    const list = memoryEntries.get(productId) ?? [];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.knowledgeBaseEntry.findUnique({ where: { id: entryId } });
  if (!existing || existing.productId !== productId) return false;
  await prisma.knowledgeBaseEntry.delete({ where: { id: entryId } });
  return true;
}
