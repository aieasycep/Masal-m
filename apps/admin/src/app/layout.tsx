import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Masalım Yönetim',
  description: 'Masalım iç yönetim paneli',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers opts every route into per-request rendering. That is what lets
  // the CSP nonce minted in src/middleware.ts reach Next's own inline scripts: a prerendered
  // static page would be frozen at build time with no nonce and then be refused by
  // `script-src 'nonce-…'`. The value itself is not needed here — Next picks the nonce up from the
  // request's Content-Security-Policy header and stamps it on every script tag it emits.
  await headers();

  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
