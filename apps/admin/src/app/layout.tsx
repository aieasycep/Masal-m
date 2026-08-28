import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Masalım Yönetim',
  description: 'Masalım iç yönetim paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
