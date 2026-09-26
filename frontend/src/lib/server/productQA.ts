import { getProduct, getProductDocumentTexts, type ProductRecord } from "@/lib/server/products";
import { listKnowledgeBaseEntries } from "@/lib/server/knowledgeBase";
import { resolveVendor } from "@/lib/server/marketplace";
import { isLLMConfigured, callLLM } from "@/lib/server/llm";

/**
 * Grounded product Q&A — "ask ANI about this product (or these products)".
 * Uses the same shared OpenAI client as src/lib/ani/assistant.ts (llm.ts),
 * with graceful no-key fallback.
 *
 * Two different kinds of question get two different answering rules, both
 * stated explicitly in the system prompt below:
 *   - Product-specific facts (a spec, a price, whether X model supports Y) —
 *     grounded strictly in this product's own stored fields, uploaded
 *     manuals, and known-issues entries. Never invented.
 *   - General technical/support concepts (what does an IP rating mean, how
 *     does load balancing generally work) — the model's own general knowledge
 *     is fine here; that's real knowledge, not a hallucination, and
 *     refusing to explain a standard technical term would just be unhelpful.
 * When a described problem isn't covered by either — a genuine hands-on
 * fault this data can't diagnose — the answer directs the user to the
 * vendor's own contact details or the nearest technical support centre,
 * rather than guessing at a fix.
 */
export interface ProductQAResult {
  answer: string;
  groundedIn: { productId: string; productName: string; documentCount: number; knowledgeBaseCount: number }[];
  configured: boolean;
}

const MAX_PRODUCTS_PER_QUESTION = 5;

async function buildContext(products: ProductRecord[]): Promise<{ block: string; groundedIn: ProductQAResult["groundedIn"] }> {
  const groundedIn: ProductQAResult["groundedIn"] = [];
  const sections: string[] = [];

  for (const product of products) {
    const [vendor, docs, kbEntries] = await Promise.all([
      resolveVendor(product.vendorId),
      getProductDocumentTexts(product.id),
      listKnowledgeBaseEntries(product.id),
    ]);
    groundedIn.push({ productId: product.id, productName: product.name, documentCount: docs.length, knowledgeBaseCount: kbEntries.length });

    const specsLines = product.specs
      ? Object.entries(product.specs).map(([k, v]) => `- ${k}: ${v}`).join("\n")
      : "(no structured specs provided)";
    const docText = docs.length
      ? docs.map((d) => `--- from "${d.filename}" ---\n${d.text}`).join("\n\n")
      : "(no manual or spec sheet uploaded for this product)";
    const kbText = kbEntries.length
      ? kbEntries.map((e) => `- Issue: ${e.issue}${e.symptoms ? `\n  Symptoms: ${e.symptoms}` : ""}\n  Resolution: ${e.resolution}`).join("\n")
      : "(no known issues documented for this product)";
    const contactLine = vendor
      ? `Vendor contact for unresolved issues: ${vendor.contact_email}${vendor.website ? ` / ${vendor.website}` : ""}`
      : "Vendor contact: unavailable";

    sections.push(
      `## ${product.name} (by ${vendor?.name ?? "unknown vendor"}, category: ${product.category})\n` +
        `Summary: ${product.summary}\n` +
        `Description: ${product.description}\n` +
        `Specs:\n${specsLines}\n\n` +
        `Manual/spec-sheet excerpts:\n${docText}\n\n` +
        `Known issues & documented resolutions:\n${kbText}\n\n` +
        contactLine,
    );
  }

  return { block: sections.join("\n\n===\n\n"), groundedIn };
}

const SYSTEM_PROMPT = `You are ANI™, Davwo's product-intelligence and technical-support assistant for a renewable-energy marketplace.

You are given, for one or more products: their listed specs, summaries, uploaded manuals/spec sheets, a known-issues knowledgebase with documented resolutions, and vendor contact details.

Rules:
1. Product-specific facts — a spec, a price, whether a model supports something — must come strictly from the information given. Never invent a number, spec, or comparison. If it isn't there, say so plainly.
2. For a described problem or fault, check the known-issues knowledgebase first. If it matches, give the documented resolution directly and clearly.
3. For general technical or support concepts that aren't specific to this exact product (e.g. what an IP rating means, how load balancing generally works, standard troubleshooting steps like checking a breaker or a connection), you may use your own general technical knowledge — that's real knowledge, not a guess, and refusing to explain a standard concept would be unhelpful.
4. If a described problem is a genuine hands-on fault that neither the knowledgebase nor general technical knowledge resolves, say so plainly and direct the user to the vendor's contact details (given above) or their nearest technical support/service centre — never guess at a physical repair or safety-relevant fix you cannot verify.
5. When comparing multiple products, be specific about what each one actually states, and note clearly when one lacks documentation covering the point in question.`;

export async function askAboutProducts(productIds: string[], question: string): Promise<ProductQAResult> {
  const uniqueIds = [...new Set(productIds)].slice(0, MAX_PRODUCTS_PER_QUESTION);
  const products = (await Promise.all(uniqueIds.map((id) => getProduct(id)))).filter((p): p is ProductRecord => Boolean(p));

  if (products.length === 0) {
    return { answer: "I couldn't find those products.", groundedIn: [], configured: true };
  }

  const { block, groundedIn } = await buildContext(products);
  if (!isLLMConfigured()) {
    return {
      answer:
        "AI-grounded product Q&A isn't configured on this deployment yet (no OPENAI_API_KEY set). " +
        "The product's own listed specs, documents and known issues are shown above — once an API key " +
        "is added, ANI™ will answer questions directly from them.",
      groundedIn,
      configured: false,
    };
  }

  const text = await callLLM(SYSTEM_PROMPT, `Product information:\n\n${block}\n\n===\n\nQuestion: ${question}`, 700);
  return {
    answer: text ?? "I couldn't generate an answer just now — please try again.",
    groundedIn,
    configured: true,
  };
}
