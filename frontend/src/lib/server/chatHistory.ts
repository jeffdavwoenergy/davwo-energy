import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import type { Block } from "@/lib/ani/blocks";

/**
 * Persistent ANI chat history — one continuous thread per (org, user), same
 * Postgres-with-in-memory-fallback pattern as every other store in this
 * codebase. content carries the full { text?, blocks?, mode? } payload so a
 * reloaded conversation renders with its original charts/tables/KPIs, not a
 * flattened transcript.
 */
export type ChatRole = "user" | "assistant";

export interface ChatContent {
  text?: string;
  blocks?: Block[];
  mode?: "live-llm" | "deterministic";
}

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: ChatContent;
  createdAt: string;
}

const memoryHistory = new Map<string, ChatMessageRecord[]>(); // key: `${orgId}:${userId}`
const memKey = (orgId: string, userId: string) => `${orgId}:${userId}`;

export async function saveChatMessage(orgId: string, userId: string, role: ChatRole, content: ChatContent): Promise<void> {
  if (!isDbConfigured()) {
    const list = memoryHistory.get(memKey(orgId, userId)) ?? [];
    list.push({ id: randomUUID(), role, content, createdAt: new Date().toISOString() });
    memoryHistory.set(memKey(orgId, userId), list);
    return;
  }
  const prisma = getPrisma()!;
  await prisma.chatMessage.create({ data: { orgId, userId, role, content: content as unknown as Prisma.InputJsonValue } });
}

/** Most recent `limit` messages, oldest-first (display order). */
export async function listChatHistory(orgId: string, userId: string, limit = 50): Promise<ChatMessageRecord[]> {
  if (!isDbConfigured()) {
    return (memoryHistory.get(memKey(orgId, userId)) ?? []).slice(-limit);
  }
  const prisma = getPrisma()!;
  const rows = await prisma.chatMessage.findMany({
    where: { orgId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows
    .map((r) => ({ id: r.id, role: r.role, content: r.content as ChatContent, createdAt: r.createdAt.toISOString() }))
    .reverse();
}

export async function clearChatHistory(orgId: string, userId: string): Promise<void> {
  if (!isDbConfigured()) {
    memoryHistory.delete(memKey(orgId, userId));
    return;
  }
  const prisma = getPrisma()!;
  await prisma.chatMessage.deleteMany({ where: { orgId, userId } });
}
