import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Third-party origins the app actually calls from the browser or server.
const CONNECT_SRC = [
  "'self'",
  "https://api.carbonintensity.org.uk",
  "https://api.octopus.energy",
  "https://api.open-meteo.com",
  "https://api.openchargemap.io",
  "https://api.anthropic.com",
];

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    // 'unsafe-inline'/'unsafe-eval' on script-src are needed for Next's own
    // hydration + the charting/map libs (Recharts, Leaflet, Framer Motion);
    // tighten with nonces once those are audited individually.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      `connect-src ${CONNECT_SRC.join(" ")}`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Next 16 no longer runs ESLint during `next build`, so the reused .jsx shadcn
  // components can't block builds. TypeScript errors still block (default).
  allowedDevOrigins: [
    "api-rebuild-5.preview.emergentagent.com",
    "api-rebuild-5.cluster-5.preview.emergentcf.cloud",
  ],
  turbopack: { root: __dirname },
  // The public marketplace moved from /products to /marketplace — keep old links working.
  async redirects() {
    return [
      { source: "/products", destination: "/marketplace", permanent: true },
      { source: "/products/:id", destination: "/marketplace/:id", permanent: true },
      { source: "/:locale(en|de|fr|es)/products", destination: "/:locale/marketplace", permanent: true },
      { source: "/:locale(en|de|fr|es)/products/:id", destination: "/:locale/marketplace/:id", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // pdfkit reads its bundled .afm font metrics via fs + __dirname at runtime;
  // Next's Server Components bundler virtualizes __dirname and breaks that
  // lookup (ENOENT on Helvetica.afm). Excluding it from bundling makes Next
  // use a plain Node `require`, which resolves the real on-disk path.
  serverExternalPackages: ["pdfkit"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
