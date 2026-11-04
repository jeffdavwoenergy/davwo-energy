"use client";

import axios from "axios";
import useSWR from "swr";
import type { PlatformOverview } from "@/lib/server/superadmin";

export type {
  PlatformOverview, OverviewOrg, OverviewUser, OverviewSupplier, OverviewProduct, OverviewLead,
} from "@/lib/server/superadmin";

/** The super admin console's own client and session — separate from both
 * the customer (api.ts) and supplier (supplierApi.ts) sessions, like those
 * two are from each other. Kept in sessionStorage rather than localStorage,
 * so the most privileged session on the platform ends with the tab. */
const superAdminApi = axios.create({ baseURL: "/api" });

const TOKEN_KEY = "davwo_superadmin_token";

export function getSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}
export function setSuperAdminToken(token: string) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}
export function clearSuperAdminToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

superAdminApi.interceptors.request.use((config) => {
  const token = getSuperAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

superAdminApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      clearSuperAdminToken();
      // Session expired mid-use — back to the console's sign-in.
      if (typeof window !== "undefined" && !/\/superadmin\/?$/.test(window.location.pathname)) {
        window.location.href = window.location.pathname.replace(/\/superadmin\/.*$/, "/superadmin");
      }
    }
    return Promise.reject(err);
  },
);

export default superAdminApi;

const fetcher = (url: string) => superAdminApi.get(url).then((r) => r.data);

/** Every console page reads this one payload — SWR dedupes it across the shell and pages. */
export function useOverview() {
  return useSWR<PlatformOverview>("/superadmin/overview", fetcher, { refreshInterval: 60_000 });
}

export function useSuperAdminSession() {
  return useSWR<{ email: string; expiresAt?: string }>("/superadmin/auth/me", fetcher);
}

export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

export const CATEGORY_LABEL: Record<string, string> = {
  "ev-chargers": "EV Chargers",
  battery: "Battery Solutions",
  solar: "Solar Solutions",
  "energy-services": "Energy Services",
  consulting: "Consulting Services",
  "ev-vehicles": "EV Vehicles",
};

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function initialsOf(name?: string) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
