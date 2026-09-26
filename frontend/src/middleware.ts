import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on every route except /api/*, Next internals, and static files
  // (favicon, images, etc.) — /api/* must stay completely locale-agnostic
  // (src/lib/api.ts's axios client uses a root-relative "/api" baseURL that
  // never carries a locale prefix).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
