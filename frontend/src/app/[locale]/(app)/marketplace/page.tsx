"use client";

import { MarketplaceCatalogue } from "@/components/marketplace/MarketplaceCatalogue";
import { useAuth } from "@/lib/auth";

export default function MarketplacePage() {
  const { user } = useAuth();
  // Logged-out visitors (public shell) get the hero; signed-in ANI™ users don't.
  return <MarketplaceCatalogue basePath="/marketplace" showHero={!user} />;
}
