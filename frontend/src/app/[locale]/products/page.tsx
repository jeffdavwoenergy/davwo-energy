"use client";

import { Suspense, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Search, Zap, ArrowRight, FileText } from "lucide-react";
import { fetcher } from "@/lib/swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Product {
  id: string;
  vendorId: string;
  name: string;
  category: string;
  summary: string;
  priceNote?: string;
}

interface Category {
  id: string;
  label: string;
}

function ProductsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [category, setCategory] = useState(sp.get("category") ?? "");

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  const { data, isLoading } = useSWR<{ products: Product[]; categories: Category[] }>(
    `/marketplace/products?${params.toString()}`,
    fetcher,
  );
  const products = data?.products ?? null;
  const categories = data?.categories ?? [];
  const loading = isLoading;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    router.replace(`/products?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/davwo-icon-white.png" alt="DAVWO" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg text-foreground">DAVWO</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
              <Link href="/supplier/login">List your products</Link>
            </Button>
            <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start your pilot</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-14 pb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-4">
          <Zap size={14} /> Technical &amp; renewable product search
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
          Search every EV charger, battery and solar product — <span className="text-emerald-600">grounded in real specs</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Ask a technical question and ANI&#8482; answers from each product&rsquo;s actual manual and spec sheet — not a generic guess.
        </p>

        <form onSubmit={submitSearch} className="mt-7 flex items-center gap-2 bg-card border border-border rounded-2xl shadow-sm p-2">
          <Search size={18} className="text-muted-foreground ml-2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 50kW DC rapid charger, or “battery with 10 year warranty”"
            className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
          <Button type="submit">Search</Button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            variant={!category ? "default" : "outline"}
            onClick={() => setCategory("")}
            className="h-auto rounded-full px-3 py-1.5 text-xs"
          >
            All categories
          </Button>
          {categories.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={category === c.id ? "default" : "outline"}
              onClick={() => setCategory(c.id)}
              className="h-auto rounded-full px-3 py-1.5 text-xs"
            >
              {c.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="text-center text-muted-foreground py-16 text-sm">Searching…</div>
        ) : !products || products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">
              {q || category ? "No products match that search yet." : "No products in the catalogue yet."}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="bg-card rounded-2xl border border-border p-5 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:shadow-md transition flex flex-col"
              >
                <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">{p.category}</span>
                <h3 className="mt-1 font-display font-semibold text-foreground">{p.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground flex-1 line-clamp-3">{p.summary}</p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{p.priceNote || "Contact for pricing"}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                    View <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>© 2026 Davwo Energy Ltd.</span>
          <span className="inline-flex items-center gap-1"><FileText size={12} /> Product manuals available on every listing</span>
        </div>
      </footer>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <ProductsInner />
    </Suspense>
  );
}
