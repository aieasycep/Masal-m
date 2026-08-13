'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminRole } from '@masalim/types';
import { clearSession, getAdmin, getToken, type AdminInfo } from '@/lib/auth';
import { ADMIN_ROLE_LABELS } from '@/lib/labels';
import { StatusPill } from '@/components/StatusPill';

interface NavItem {
  href: string;
  label: string;
  roles: AdminRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Kontrol Paneli', roles: ['ADMIN', 'SUPPORT', 'OPERATIONS'] },
  { href: '/users', label: 'Kullanıcılar', roles: ['ADMIN', 'SUPPORT'] },
  { href: '/stories', label: 'Hikâyeler', roles: ['ADMIN', 'SUPPORT'] },
  { href: '/jobs', label: 'İşler', roles: ['ADMIN', 'OPERATIONS'] },
  { href: '/orders', label: 'Siparişler', roles: ['ADMIN', 'OPERATIONS'] },
  { href: '/system-voices', label: 'Sistem Sesleri', roles: ['ADMIN'] },
  { href: '/feature-flags', label: 'Özellik Bayrakları', roles: ['ADMIN'] },
  { href: '/audit-logs', label: 'Denetim Kaydı', roles: ['ADMIN'] },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getToken() == null) {
      router.replace('/login');
      return;
    }
    setAdmin(getAdmin());
    setReady(true);
  }, [router]);

  if (!ready) return null;

  // Nav hiding is UX only — the API enforces RBAC on every endpoint.
  const role = admin?.role;
  const visibleItems = role != null ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : NAV_ITEMS;

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Masalım</div>
          <div className="brand-sub">Yönetim Paneli</div>
        </div>
        <nav className="nav">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          {admin != null && (
            <>
              <span className="topbar-email">{admin.email}</span>
              <StatusPill tone="info">{ADMIN_ROLE_LABELS[admin.role]}</StatusPill>
            </>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={handleLogout}>
            Çıkış
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
