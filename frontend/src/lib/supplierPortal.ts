"use client";

// Shared data hooks for the supplier portal pages. SWR dedupes by key, so the
// shell, dashboard and individual pages can all call these without extra requests.

import useSWR from "swr";
import supplierApi from "@/lib/supplierApi";
import type { LeadStatus } from "@/lib/server/marketplace";
import type { SupplierProduct } from "@/lib/supplierCatalog";

export interface SupplierAccount {
  id: string;
  email: string;
  companyName: string;
  category: string;
  region?: string;
  website?: string;
  verified: boolean;
  createdAt: string;
}

export interface SupplierLead {
  id: string;
  name: string;
  email: string;
  message: string;
  status: LeadStatus;
  response?: string;
  respondedAt?: string;
  createdAt: string;
}

export const supplierFetcher = (url: string) => supplierApi.get(url).then((r) => r.data);

export function useSupplierAccount() {
  return useSWR<SupplierAccount>("/supplier/auth/me", supplierFetcher);
}

export function useSupplierProducts() {
  const res = useSWR<{ products: SupplierProduct[] }>("/supplier/products", supplierFetcher);
  return { ...res, products: res.data?.products };
}

export function useSupplierLeads() {
  const res = useSWR<{ leads: SupplierLead[] }>("/supplier/leads", supplierFetcher);
  return { ...res, leads: res.data?.leads };
}

export function apiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}
