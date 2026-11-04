"use client";

import SuperAdminShell from "@/components/superadmin/SuperAdminShell";

export default function SuperAdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
