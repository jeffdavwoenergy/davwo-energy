import { describe, it, expect } from "vitest";
import {
  createProduct, getProduct, listProducts, updateProduct, deleteProduct, parseListing,
  addProductImage, getProductImage, deleteProductImage,
  ImageTooLargeError, UnsupportedImageTypeError, TooManyImagesError, MAX_PRODUCT_IMAGES,
} from "@/lib/server/products";
import { mapSupplierProduct } from "@/lib/supplierCatalog";

const png = { mimeType: "image/png", data: Buffer.from("fake-png") };

describe("parseListing", () => {
  it("keeps valid fields, rounds money and drops unknown keys", () => {
    expect(parseListing({
      brand: "  Volt  ", monthlyPrice: "45.555", upfrontPayment: 0, contractMonths: "48", termType: "lease",
      keySpecs: [{ label: "Power", value: "7 kW", icon: "zap" }], features: [" Fast ", ""], hacker: "x",
    })).toEqual({
      brand: "Volt", monthlyPrice: 45.56, upfrontPayment: 0, contractMonths: 48, termType: "lease",
      keySpecs: [{ label: "Power", value: "7 kW", icon: "zap" }], features: ["Fast"],
    });
  });

  it("omits bad values instead of rejecting the listing", () => {
    expect(parseListing({
      monthlyPrice: -5, outrightPrice: "abc", contractMonths: 13, termType: "rent",
      keySpecs: [{ label: "No value" }, { label: "A", value: "B", icon: "nope" }],
    })).toEqual({ keySpecs: [{ label: "A", value: "B", icon: "check" }] });
  });

  it("caps key specs and features, and returns undefined for nothing usable", () => {
    const many = parseListing({
      keySpecs: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: "v" })),
      features: Array.from({ length: 12 }, (_, i) => `f${i}`),
    });
    expect(many?.keySpecs).toHaveLength(6);
    expect(many?.features).toHaveLength(8);
    expect(parseListing({})).toBeUndefined();
    expect(parseListing("nope")).toBeUndefined();
    expect(parseListing([1])).toBeUndefined();
  });
});

describe("product listings + images (in-memory)", () => {
  it("stores the listing on create and replaces it on update", async () => {
    const p = await createProduct({
      vendorId: "sup-1", name: "Wallbox", category: "ev-chargers", summary: "s", description: "d",
      listing: { monthlyPrice: 15, contractMonths: 36 },
    });
    expect((await getProduct(p.id))?.listing).toEqual({ monthlyPrice: 15, contractMonths: 36 });

    const updated = await updateProduct(p.id, { name: "Wallbox 2", listing: { monthlyPrice: 18 } });
    expect(updated?.name).toBe("Wallbox 2");
    expect((await getProduct(p.id))?.listing).toEqual({ monthlyPrice: 18 });
    expect(await updateProduct("missing", { name: "x" })).toBeUndefined();
  });

  it("adds images in gallery order, serves and removes them, and exposes ids on the product", async () => {
    const p = await createProduct({ vendorId: "sup-1", name: "Pics", category: "solar", summary: "s", description: "d" });
    const a = await addProductImage(p.id, png);
    const b = await addProductImage(p.id, { mimeType: "image/jpeg", data: Buffer.from("jpg") });
    expect((await getProduct(p.id))?.imageIds).toEqual([a.id, b.id]);
    expect((await listProducts({ vendorId: "sup-1" })).find((x) => x.id === p.id)?.imageIds).toEqual([a.id, b.id]);
    expect((await getProductImage(b.id))?.mimeType).toBe("image/jpeg");

    expect(await deleteProductImage("other-product", a.id)).toBe(false);
    expect(await deleteProductImage(p.id, a.id)).toBe(true);
    expect((await getProduct(p.id))?.imageIds).toEqual([b.id]);
    expect(await getProductImage(a.id)).toBeUndefined();
  });

  it("rejects bad image types, oversized images and more than the gallery limit", async () => {
    const p = await createProduct({ vendorId: "sup-1", name: "Limits", category: "solar", summary: "s", description: "d" });
    await expect(addProductImage(p.id, { mimeType: "image/gif", data: Buffer.from("g") })).rejects.toThrow(UnsupportedImageTypeError);
    await expect(addProductImage(p.id, { mimeType: "image/png", data: Buffer.alloc(3 * 1024 * 1024 + 1) })).rejects.toThrow(ImageTooLargeError);
    for (let i = 0; i < MAX_PRODUCT_IMAGES; i++) await addProductImage(p.id, png);
    await expect(addProductImage(p.id, png)).rejects.toThrow(TooManyImagesError);
  });

  it("deleteProduct also removes the product's images", async () => {
    const p = await createProduct({ vendorId: "sup-1", name: "Gone", category: "solar", summary: "s", description: "d" });
    const img = await addProductImage(p.id, png);
    await deleteProduct(p.id);
    expect(await getProductImage(img.id)).toBeUndefined();
  });
});

describe("mapSupplierProduct", () => {
  const base = { id: "p1", vendorId: "v", vendorName: "Acme", name: "Unit", category: "battery", summary: "Sum", description: "One. Two.", createdAt: "" };

  it("uses the supplier's listing values for the card and plan", () => {
    const mp = mapSupplierProduct({
      ...base, imageIds: ["i1"],
      listing: {
        brand: "Volt", variant: "10kWh home battery", monthlyPrice: 49, upfrontPayment: 0, contractMonths: 48,
        termType: "subscription", outrightPrice: 5200, maintenanceMonthly: 6, maintenanceLabel: "care plan",
        keySpecs: [{ label: "Capacity", value: "10 kWh", icon: "battery" }], features: ["Backup power"],
        installEstimate: "2 weeks", stockNote: "In stock",
      },
    });
    expect(mp).toMatchObject({
      brand: "Volt", version: "10kWh home battery", baseMonthlyPrice: 49, baseInitialPayment: 0, contractMonths: 48,
      termType: "subscription", outrightPrice: 5200, maintenanceCost: 6, maintenanceLabel: "care plan",
      specsGrid: [{ label: "Capacity", value: "10 kWh", icon: "battery" }], features: ["Backup power"],
      deliveryEstimate: "2 weeks", deliveryStockNote: "In stock",
      images: ["/api/marketplace/products/p1/images/i1"], photosCount: 1,
    });
  });

  it("falls back to estimates for a listing saved before the structured form", () => {
    const mp = mapSupplierProduct({ ...base, priceNote: "From £3,600 installed" });
    expect(mp.brand).toBe("Acme");
    expect(mp.contractMonths).toBe(36);
    expect(mp.baseMonthlyPrice).toBe(108); // 3600 / 36 * 1.08
    expect(mp.baseInitialPayment).toBe(324);
    expect(mp.maintenanceCost).toBe(0);
    expect(mp.features).toEqual(["One.", "Two."]);
    expect(mp.images.length).toBeGreaterThan(0);
  });

  it("prefers preview image URLs when given", () => {
    expect(mapSupplierProduct(base, ["data:image/png;base64,x"]).images).toEqual(["data:image/png;base64,x"]);
  });
});

describe("demo company listings", () => {
  it("both demo suppliers have a built-in catalogue with platform photos", async () => {
    const davwo = await listProducts({ vendorId: "s-davwo" });
    const acme = await listProducts({ vendorId: "s-acme" });
    expect(davwo.map((p) => p.name)).toEqual(expect.arrayContaining(["GridSaver 13.5", "SunRoof 6kW", "SmartHub Energy Monitor"]));
    expect(acme.map((p) => p.name)).toEqual(expect.arrayContaining(["FleetCharge 22", "RapidDC 60", "HomeCharge 7.4"]));
    const mp = mapSupplierProduct({ ...acme.find((p) => p.name === "RapidDC 60")!, vendorName: "Acme Corp" });
    expect(mp).toMatchObject({ brand: "Acme", baseMonthlyPrice: 310, baseInitialPayment: 930, termType: "lease", maintenanceCost: 45 });
    expect(mp.images[0]).toMatch(/^\/marketplace\//);
  });

  it("a supplier editing a demo listing keeps its platform photos (gallery can't be set or wiped via the API)", async () => {
    const { PATCH } = await import("@/app/api/supplier/products/[id]/route");
    const { signSupplierToken } = await import("@/lib/server/jwt");
    const token = await signSupplierToken({ sub: "s-acme", email: "admin@acmecorp.com" });
    const res = await PATCH(
      new Request("http://x/api/supplier/products/demo-acme-homecharge-74", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "HomeCharge 7.4", category: "ev-chargers", summary: "s", description: "d",
          listing: { monthlyPrice: 19, gallery: ["https://evil.example/x.jpg"] },
        }),
      }),
      { params: Promise.resolve({ id: "demo-acme-homecharge-74" }) },
    );
    expect(res.status).toBe(200);
    const listing = (await getProduct("demo-acme-homecharge-74"))!.listing!;
    expect(listing.monthlyPrice).toBe(19);
    expect(listing.gallery?.[0]).toMatch(/^\/marketplace\//);
    expect(listing.gallery).not.toContain("https://evil.example/x.jpg");
  });
});
