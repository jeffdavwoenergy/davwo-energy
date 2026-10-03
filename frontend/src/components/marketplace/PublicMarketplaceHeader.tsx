"use client";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

// Public top bar for the standalone (logged-out) marketplace pages.
export function PublicMarketplaceHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" data-testid="public-mp-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/davwo-icon.png" alt="DAVWO" className="h-8 w-auto" />
          <span className="font-display font-bold text-lg tracking-tight text-slate-900">DAVWO</span>
          <span className="hidden sm:inline text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-1">
            Marketplace
          </span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <Button asChild variant="ghost" className="text-slate-600 hover:text-slate-900" data-testid="public-mp-dashboard">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" className="hidden sm:inline-flex text-slate-600 hover:text-slate-900" data-testid="public-mp-supplier">
              <Link href="/supplier/login">List your products</Link>
            </Button>
          )}
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="public-mp-pilot">
            <Link href="/signup">Start your pilot</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
