import { NextResponse } from "next/server";
import { llmStatus } from "@/lib/server/llm";
import { isDbConfigured } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

/** Liveness plus configuration status (never secrets): whether ANI's LLM and
 * the database are wired, and the LLM's most recent failure if any. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "DAVWO ANI™",
    llm: llmStatus(),
    database: isDbConfigured() ? "configured" : "in-memory fallback",
  });
}
