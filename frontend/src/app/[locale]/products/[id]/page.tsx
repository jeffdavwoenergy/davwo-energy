"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

// Old public product detail — now handled inside the in-app Marketplace.
export default function ProductDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/marketplace/${id}`);
  }, [router, id]);
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Redirecting…</div>;
}
