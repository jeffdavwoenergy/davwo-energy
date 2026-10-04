import { describe, it, expect } from "vitest";
import {
  registerSupplier, authenticateSupplier, findSupplierById,
  updateSupplierProfile, changeSupplierPassword, WrongSupplierPasswordError,
} from "@/lib/server/suppliers";

describe("supplier settings (in-memory fallback)", () => {
  it("updates the company profile, and an empty region/website clears it", async () => {
    const s = await registerSupplier({
      email: `settings-${Math.random()}@co.example`, password: "password123",
      companyName: "Old Name", category: "solar", region: "Leeds", website: "https://old.example",
    });
    const updated = await updateSupplierProfile(s.id, { companyName: "New Name", category: "battery", region: "", website: "https://new.example" });
    expect(updated).toMatchObject({ companyName: "New Name", category: "battery", website: "https://new.example" });
    expect(updated?.region).toBeUndefined();
    expect(updated).not.toHaveProperty("passwordHash");
    expect((await findSupplierById(s.id))?.companyName).toBe("New Name");
    expect(await updateSupplierProfile("missing", { companyName: "x" })).toBeUndefined();
  });

  it("changes the password only when the current one is right", async () => {
    const email = `pw-${Math.random()}@co.example`;
    const s = await registerSupplier({ email, password: "password123", companyName: "Co", category: "solar" });

    await expect(changeSupplierPassword(s.id, "wrong-password", "newpass456")).rejects.toThrow(WrongSupplierPasswordError);
    await changeSupplierPassword(s.id, "password123", "newpass456");

    await expect(authenticateSupplier(email, "password123")).rejects.toThrow(WrongSupplierPasswordError);
    expect((await authenticateSupplier(email, "newpass456")).id).toBe(s.id);
    await expect(changeSupplierPassword("missing", "a", "bbbbbbbb")).rejects.toThrow(WrongSupplierPasswordError);
  });
});
