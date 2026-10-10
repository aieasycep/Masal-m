import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy with a fresh script nonce.
 *
 * Every admin page carries Next's own inline bootstrap scripts (`self.__next_f.push(...)`, the
 * App Router payload), so `script-src 'self'` alone would blank the panel. Instead each response
 * gets a random nonce: Next stamps it on every `<script>` it emits (inline payload + /_next/static
 * chunks) and `'strict-dynamic'` lets those nonced scripts load the chunks they import at runtime
 * (client-side navigation). Anything injected by a third party — an extension, an XSS payload —
 * has no nonce and is refused.
 *
 * The static security headers (HSTS, nosniff, frame denial, …) live in next.config.ts; only the
 * nonce-bearing CSP has to be computed here.
 */

const IS_DEV = process.env.NODE_ENV === 'development';

/** The API is the only cross-origin destination the panel talks to (plain `fetch` in lib/api.ts). */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').origin;

function generateNonce(): string {
  // Edge runtime: no Buffer — base64-encode 16 random bytes by hand.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // `next dev` evaluates React Refresh / source-mapped modules through eval.
  if (IS_DEV) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'", API_ORIGIN];
  // HMR websocket + a local API on any port while developing.
  if (IS_DEV) connectSrc.push('ws:', 'http://localhost:*');

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // React sets inline styles through `element.style` (not blocked), but keep 'unsafe-inline'
    // for any `style=""` attribute that lands in the server HTML.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  // Browsers never upgrade localhost, so the local `next start` smoke stays on http.
  if (!IS_DEV) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  // Next reads the nonce from the REQUEST's Content-Security-Policy header
  // (server/app-render/get-script-nonce-from-header) and applies it to every script tag it
  // renders; `x-nonce` is the conventional handle for app code (`headers().get('x-nonce')`).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static assets and the favicon are not documents — no CSP needed there. Router prefetches
      // fetch RSC payloads (no HTML), so skip them too instead of minting a nonce per prefetch.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
