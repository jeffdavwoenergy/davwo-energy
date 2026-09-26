import { createOrg, type Market } from "@/lib/server/orgs";
import { createUser } from "@/lib/server/users";
import { signToken } from "@/lib/server/jwt";
import type { LoginResponse } from "@/lib/types";

export interface SignupInput {
  orgName: string;
  region?: string;
  market?: Market;
  name: string;
  email: string;
  password: string;
}

/** Self-service signup: provisions a brand-new tenant (org) and its first
 * (admin) user in one step, and returns a ready-to-use session token — no
 * separate "wait for approval" step. The org's synthetic dataset is live
 * immediately (tenantSeed() hashes any org id to a distinct seed), so the
 * new admin never lands on an empty dashboard. */
export async function signup(input: SignupInput): Promise<LoginResponse> {
  const org = await createOrg(input.orgName, input.region, input.market);
  const user = await createUser(org.id, input.email, input.name, "admin", input.password);
  const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: org.id });
  return { token, user };
}
