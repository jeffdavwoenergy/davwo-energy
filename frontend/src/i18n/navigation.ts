import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Drop-in, locale-aware replacements for next/link and next/navigation's
// Link/useRouter/usePathname/redirect — every existing `<Link href="/x">`/
// `router.push("/x")` call site swaps its import to these and automatically
// gets the active locale prefixed, with zero per-call-site logic changes.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
