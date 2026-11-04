import type { Metadata } from "next";

// Reached only by typing /superadmin — never linked from the app, and kept
// out of search engines.
export const metadata: Metadata = {
  title: "DAVWO · Super Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
