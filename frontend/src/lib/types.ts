export type Role = "admin" | "operator" | "pilot";

/** The markets a real (non-demo) data provider exists for — selects which
 * set of live data connectors (src/lib/data/regions/*.ts) an org's data
 * comes from. Shared between client (signup/settings forms) and server
 * (src/lib/server/orgs.ts) so both validate against the same list. */
export const MARKETS = ["uk", "eu", "us"] as const;
export type Market = (typeof MARKETS)[number];
export const MARKET_LABEL: Record<Market, string> = { uk: "United Kingdom", eu: "Europe", us: "United States" };

export interface ReportSchedule {
  enabled: boolean;
  period: "daily" | "weekly" | "monthly";
  category: "energy" | "asset" | "carbon" | "ani";
}

export interface Preferences {
  liveData: boolean;
  emailAlerts: boolean;
  autoOptimise: boolean;
  reportSchedule?: ReportSchedule;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  orgName?: string;
  company?: string;
  job_title?: string | null;
  avatar_initials?: string;
  preferences?: Preferences;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  region: string;
  market?: Market;
}

export interface LoginResponse {
  token: string;
  user: User;
}
