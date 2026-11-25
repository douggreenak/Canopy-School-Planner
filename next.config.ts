import type { NextConfig } from "next";

// Security headers previously set by a per-request middleware/proxy function.
// They're static (no request-dependent logic — only a build-time NODE_ENV
// check), so setting them here instead removes a Node.js function
// invocation from every single matched request — faster than proxy.ts for
// the same result. See node_modules/next/dist/docs/.../headers.md.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    {
      key: 'Content-Security-Policy',
      value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://va.vercel-scripts.com; frame-ancestors 'none';",
    },
  ] : []),
];

// Student grades/classes/schedules come back from /api/*. Tell browsers and any
// shared proxy/CDN never to cache those responses (shared school computers,
// back-button history, intermediary caches).
const apiNoStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The local test runner sets CANOPY_LOW_CPU so its full production build
  // doesn't use every core (it once pinned a laptop at 100%). Unset elsewhere.
  ...(process.env.CANOPY_LOW_CPU ? { experimental: { cpus: 3, webpackBuildWorker: true } } : {}),
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min', 'mysql2'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: apiNoStoreHeaders },
    ];
  },
  ...(process.env.NODE_ENV === 'development' ? {
    allowedDevOrigins: [
      '192.168.1.15',
      '192.168.1.*',
      '10.0.0.*',
      '*.local',
    ],
  } : {}),
};

export default nextConfig;
