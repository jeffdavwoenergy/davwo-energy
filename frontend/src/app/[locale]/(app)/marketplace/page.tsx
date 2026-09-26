"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import useSWR from "swr";
import { Store, Star, ShieldCheck, MapPin, Layers, Search, Settings2, Inbox } from "lucide-react";
import { fetcher } from "@/lib/swr";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import KpiCard from "@/components/shared/KpiCard";
import { useAuth } from "@/lib/auth";
import type { Vendor, VendorCategory } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";

interface VendorsResponse {
  vendors: Vendor[];
  categories: { id: VendorCategory; label: string }[];
}

export default function MarketplacePage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<VendorCategory | "all">("all");
  const query = category === "all" ? "" : `?category=${category}`;
  const { data, error } = useSWR<VendorsResponse>(`/marketplace/vendors${query}`, fetcher);

  const vendors = data?.vendors ?? [];
  const categories = data?.categories ?? [];
  const verifiedCount = vendors.filter((v) => v.verified).length;

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle="Vetted EV charging, storage, solar and energy-service partners. Preview only — no payments or transactions in this release."
        right={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/marketplace/enquiries"><Inbox size={15} /> My enquiries</Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/products" target="_blank"><Search size={15} /> Product search</Link>
            </Button>
            {user?.role === "admin" && (
              <Button asChild className="gap-2">
                <Link href="/marketplace/manage"><Settings2 size={15} /> Manage products</Link>
              </Button>
            )}
          </div>
        }
      />

      {error && <div className="mb-6"><ErrorBox /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {!data ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            <KpiCard label="Listed Partners" value={vendors.length} icon={Store} tone="mint" />
            <KpiCard label="Categories" value={categories.length} icon={Layers} tone="sky" />
            <KpiCard label="Verified Partners" value={verifiedCount} icon={ShieldCheck} tone="lavender" />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <Button
          size="sm"
          variant={category === "all" ? "default" : "outline"}
          onClick={() => setCategory("all")}
          className="h-auto rounded-full px-3.5 py-1.5"
        >
          All
        </Button>
        {categories.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={category === c.id ? "default" : "outline"}
            onClick={() => setCategory(c.id)}
            className="h-auto rounded-full px-3.5 py-1.5"
          >
            {c.label}
          </Button>
        ))}
      </div>

      <Panel bodyClassName="p-0">
        {!data ? (
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[210px]" />
            ))}
          </div>
        ) : !vendors.length ? (
          <EmptyBox message="No partners in this category yet." />
        ) : (
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/marketplace/${v.id}`}
                className="rounded-2xl border border-border p-5 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:shadow-sm transition flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-display font-semibold">
                    {v.logo_initials}
                  </div>
                  {v.verified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-2 py-0.5">
                      <ShieldCheck size={11} /> Verified
                    </span>
                  )}
                </div>
                <div className="mt-3 font-display font-semibold text-foreground">{v.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{v.tagline}</div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-amber-500 fill-amber-500" />
                    {v.rating.toFixed(1)} ({v.reviews})
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {v.region}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {v.highlights.slice(0, 2).map((h) => (
                    <span key={h} className="text-[11px] bg-accent text-muted-foreground border border-border rounded-full px-2 py-0.5">
                      {h}
                    </span>
                  ))}
                </div>
                <div className="mt-auto pt-4 text-sm font-semibold text-emerald-600">View profile →</div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
