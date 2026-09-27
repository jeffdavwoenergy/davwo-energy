"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// The public "Search products" page has been replaced by the in-app Marketplace.
export default function ProductsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketplace");
  }, [router]);
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Redirecting to the marketplace…</div>;
}
