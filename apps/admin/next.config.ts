import type { NextConfig } from 'next';

/**
 * Static security headers for every response (pages and /_next assets alike). The host nginx
 * vhost adds none of these, so the app is the single place they come from. The per-request
 * Content-Security-Policy (nonce-based) is set by src/middleware.ts, not here.
 */
const SECURITY_HEADERS = [
  // 2 years; the admin is only ever served over TLS (certbot vhost on the VPS).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Legacy twin of CSP `frame-ancestors 'none'` for browsers that predate it.
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  // Linting runs standalone via `pnpm lint` (shared @masalim/config flat config);
  // Next's built-in lint step expects eslint-config-next which we deliberately skip.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
