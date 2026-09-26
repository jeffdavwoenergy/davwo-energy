import { NextResponse } from "next/server";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";
import { getProduct } from "@/lib/server/products";
import { addKnowledgeBaseEntry, listKnowledgeBaseEntries } from "@/lib/server/knowledgeBase";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Public — known issues are useful to a prospective buyer too (real
 * transparency beats hiding problems), and they're what grounds ANI's
 * support answers on the product detail page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProduct(id))) return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  return NextResponse.json({ entries: await listKnowledgeBaseEntries(id) });
}

/** Admin-only — for the platform team adding a known issue on a vendor's
 * behalf. Suppliers add their own through /api/supplier/products/[id]/
 * knowledgebase instead. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`kb-create:${clientKey(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  if (!(await getProduct(id))) return NextResponse.json({ detail: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const issue: string = (body?.issue ?? "").toString().trim().slice(0, 200);
  const symptoms: string = (body?.symptoms ?? "").toString().trim().slice(0, 1000);
  const resolution: string = (body?.resolution ?? "").toString().trim().slice(0, 4000);
  if (!issue || !resolution) {
    return NextResponse.json({ detail: "issue and resolution are required" }, { status: 400 });
  }

  const entry = await addKnowledgeBaseEntry(id, { issue, symptoms: symptoms || undefined, resolution });
  return NextResponse.json(entry, { status: 201 });
}
