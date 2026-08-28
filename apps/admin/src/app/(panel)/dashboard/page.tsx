'use client';

import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: 'danger' | 'primary';
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent != null ? ` accent-${accent}` : ''}`}>{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useApi(() => api.dashboardStats(), []);

  return (
    <div>
      <div className="page-head">
        <h1>Kontrol Paneli</h1>
      </div>
      {loading && <div className="card state">Yükleniyor…</div>}
      {error != null && <div className="card state state-error">{error}</div>}
      {data != null && (
        <div className="stats-grid">
          <StatCard
            label="Toplam Kullanıcı"
            value={data.users.total}
            sub={`Son 7 günde +${data.users.last7Days}`}
          />
          <StatCard
            label="Toplam Hikâye"
            value={data.stories.total}
            sub={`Son 7 günde +${data.stories.last7Days} · ${data.stories.failed7Days} başarısız`}
          />
          <StatCard label="Kuyruktaki İş" value={data.jobs.queued} accent="primary" />
          <StatCard label="Çalışan İş" value={data.jobs.running} accent="primary" />
          <StatCard
            label="Başarısız İş (24 saat)"
            value={data.jobs.failed24h}
            accent={data.jobs.failed24h > 0 ? 'danger' : undefined}
          />
          <StatCard label="Açık Sipariş" value={data.orders.open} />
          <StatCard label="Kargolanan (30 gün)" value={data.orders.shipped30Days} />
          <StatCard label="Premium Abone" value={data.subscriptions.premium} accent="primary" />
        </div>
      )}
    </div>
  );
}
