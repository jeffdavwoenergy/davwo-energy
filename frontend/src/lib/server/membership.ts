import { findByEmail } from "@/lib/server/users";
import { findSupplierByEmail } from "@/lib/server/suppliers";

export type MembershipTier = "full" | "ani" | "supplier";

export interface Membership {
  tier: MembershipTier;
  ani: boolean;
  supplier: boolean;
  email: string;
  /** Set by /api/membership: this account is linked to its counterpart on
   * the other platform, so switching skips that platform's sign-in. */
  linked?: boolean;
}

/**
 * Which Davwo platforms a login email has an account on. ANI™ and the
 * Supplier Portal are separate accounts with separate sessions; the same
 * email on both is "Full" membership. Informational only — it never grants
 * a session on the other platform (that still needs its own sign-in).
 */
export async function getMembership(email: string): Promise<Membership> {
  const [user, supplier] = await Promise.all([findByEmail(email), findSupplierByEmail(email)]);
  const ani = Boolean(user);
  const sup = Boolean(supplier);
  return { email: email.toLowerCase().trim(), ani, supplier: sup, tier: ani && sup ? "full" : sup ? "supplier" : "ani" };
}
