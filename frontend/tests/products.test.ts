import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import {
  createProduct, listProducts, getProduct, deleteProduct,
  addProductDocument, listProductDocuments, getProductDocument, getProductDocumentTexts,
  DocumentTooLargeError, UnsupportedDocumentTypeError,
} from "@/lib/server/products";

describe("products (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("creates a product and finds it back by id", async () => {
    const product = await createProduct({
      vendorId: "voltway-networks", name: "Rapid 50", category: "ev-chargers",
      summary: "50kW DC rapid charger", description: "A rugged depot charger.",
      specs: { "Max output": "50 kW" },
    });
    expect(product.id).toBeTruthy();
    expect((await getProduct(product.id))?.name).toBe("Rapid 50");
    expect(await getProduct("does-not-exist")).toBeUndefined();
  });

  it("listProducts filters by category and free-text query across name/summary/description", async () => {
    const org = `vend-${Math.random()}`;
    const first = await createProduct({ vendorId: org, name: "Northgate Solar Array", category: "solar", summary: "Rooftop solar", description: "500kW array." });
    await new Promise((r) => setTimeout(r, 2));
    const second = await createProduct({ vendorId: org, name: "Depot Battery Bank", category: "battery", summary: "Peak-shaving BESS", description: "1MWh containerised storage." });

    // No filter, both vendor's products present — exercises the newest-first sort across 2+ results.
    const all = (await listProducts()).filter((p) => p.vendorId === org);
    expect(all.map((p) => p.id)).toEqual([second.id, first.id]);

    const solarOnly = await listProducts({ category: "solar" });
    expect(solarOnly.every((p) => p.category === "solar")).toBe(true);
    expect(solarOnly.some((p) => p.name === "Northgate Solar Array")).toBe(true);

    const searched = await listProducts({ q: "peak-shaving" });
    expect(searched.some((p) => p.name === "Depot Battery Bank")).toBe(true);

    const byVendor = await listProducts({ vendorId: org });
    expect(byVendor).toHaveLength(2);
    expect(await listProducts({ vendorId: `vendor-other-${Math.random()}` })).toEqual([]);
    expect(searched.every((p) => p.name !== "Northgate Solar Array")).toBe(true);
  });

  it("listProducts search also matches an uploaded document's extracted text", async () => {
    const product = await createProduct({
      vendorId: "v1", name: "Mystery Unit", category: "ev-chargers",
      summary: "See manual for details", description: "Spec sheet has the real numbers.",
    });
    await addProductDocument(product.id, {
      filename: "manual.txt", mimeType: "text/plain",
      data: Buffer.from("Supports OCPP 2.0.1 and dynamic load balancing across 4 ports."),
    });
    const found = await listProducts({ q: "dynamic load balancing" });
    expect(found.some((p) => p.id === product.id)).toBe(true);
    expect(await listProducts({ q: "no-such-phrase-anywhere" })).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: product.id })]),
    );
  });

  it("addProductDocument rejects oversized and unsupported files", async () => {
    const product = await createProduct({ vendorId: "v1", name: "X", category: "solar", summary: "s", description: "d" });
    const tooBig = Buffer.alloc(9 * 1024 * 1024);
    await expect(addProductDocument(product.id, { filename: "big.pdf", mimeType: "application/pdf", data: tooBig })).rejects.toThrow(
      DocumentTooLargeError,
    );
    await expect(
      addProductDocument(product.id, { filename: "image.png", mimeType: "image/png", data: Buffer.from("x") }),
    ).rejects.toThrow(UnsupportedDocumentTypeError);
  });

  it("addProductDocument stores a plain-text manual, extracts its text, and it's downloadable", async () => {
    const product = await createProduct({ vendorId: "v1", name: "Y", category: "solar", summary: "s", description: "d" });
    const meta = await addProductDocument(product.id, {
      filename: "spec.txt", mimeType: "text/plain", data: Buffer.from("Warranty: 10 years."),
    });
    expect(meta.hasExtractedText).toBe(true);

    const listed = await listProductDocuments(product.id);
    expect(listed.map((d) => d.id)).toContain(meta.id);

    const downloaded = await getProductDocument(meta.id);
    expect(downloaded?.data.toString("utf-8")).toBe("Warranty: 10 years.");

    const texts = await getProductDocumentTexts(product.id);
    expect(texts).toEqual([{ filename: "spec.txt", text: "Warranty: 10 years." }]);
  });

  it(
    "addProductDocument extracts real text from a genuine PDF",
    async () => {
      const PDFDocument = (await import("pdfkit")).default;
      const chunks: Buffer[] = [];
      const doc = new PDFDocument();
      doc.on("data", (c: Buffer) => chunks.push(c));
      const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
      doc.text("Battery capacity: 10 kWh. Round-trip efficiency: 95%.");
      doc.end();
      await done;

      const product = await createProduct({ vendorId: "v1", name: "Z", category: "battery", summary: "s", description: "d" });
      const meta = await addProductDocument(product.id, { filename: "manual.pdf", mimeType: "application/pdf", data: Buffer.concat(chunks) });
      expect(meta.hasExtractedText).toBe(true);
      const texts = await getProductDocumentTexts(product.id);
      expect(texts[0].text).toContain("Round-trip efficiency: 95%");
    },
    15000, // pdf.js's real parse/worker setup is genuinely slower than vitest's 5s default.
  );

  it("addProductDocument stores a corrupt PDF anyway, with hasExtractedText false", async () => {
    const product = await createProduct({ vendorId: "v1", name: "Corrupt", category: "solar", summary: "s", description: "d" });
    const meta = await addProductDocument(product.id, {
      filename: "broken.pdf", mimeType: "application/pdf", data: Buffer.from("this is not a real pdf"),
    });
    expect(meta.hasExtractedText).toBe(false);
    const downloaded = await getProductDocument(meta.id);
    expect(downloaded?.data.toString()).toBe("this is not a real pdf"); // still downloadable
    expect(await getProductDocumentTexts(product.id)).toEqual([]);
  });

  it("listProductDocuments sorts multiple documents newest-first", async () => {
    const product = await createProduct({ vendorId: "v1", name: "Multi-doc", category: "solar", summary: "s", description: "d" });
    const first = await addProductDocument(product.id, { filename: "a.txt", mimeType: "text/plain", data: Buffer.from("a") });
    await new Promise((r) => setTimeout(r, 2));
    const second = await addProductDocument(product.id, { filename: "b.txt", mimeType: "text/plain", data: Buffer.from("b") });
    const listed = await listProductDocuments(product.id);
    expect(listed.map((d) => d.id)).toEqual([second.id, first.id]);
  });

  it("getProductDocument and getProductDocumentTexts return nothing for an unknown id", async () => {
    expect(await getProductDocument("nope")).toBeUndefined();
    expect(await getProductDocumentTexts("nope")).toEqual([]);
  });

  it("deleteProduct removes the product and its documents, and is false for an unknown id", async () => {
    const product = await createProduct({ vendorId: "v1", name: "Removable", category: "solar", summary: "s", description: "d" });
    const doc = await addProductDocument(product.id, { filename: "spec.txt", mimeType: "text/plain", data: Buffer.from("x") });

    expect(await deleteProduct(product.id)).toBe(true);
    expect(await getProduct(product.id)).toBeUndefined();
    expect(await getProductDocument(doc.id)).toBeUndefined(); // documents cleaned up too
    expect(await deleteProduct(product.id)).toBe(false); // already gone
    expect(await deleteProduct("never-existed")).toBe(false);
  });
});
