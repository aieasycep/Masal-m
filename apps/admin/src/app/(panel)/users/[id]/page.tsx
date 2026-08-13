'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PLAN_LABELS } from '@/lib/labels';
import { StatusPill } from '@/components/StatusPill';

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, loading, error } = useApi(() => api.userDetail(id), [id]);

  return (
    <div>
      <div className="page-head">
        <h1>Kullanıcı Detayı</h1>
        <Link href="/users" className="btn btn-outline btn-sm">
          ← Kullanıcılara dön
        </Link>
      </div>
      {loading && <div className="card state">Yükleniyor…</div>}
      {error != null && <div className="card state state-error">{error}</div>}
      {data != null && (
        <div className="detail-grid">
          <div className="card">
            <h3>Bilgiler</h3>
            <dl className="kv">
              <dt>E-posta</dt>
              <dd>{data.email}</dd>
              <dt>İsim</dt>
              <dd>{data.name}</dd>
              <dt>Dil</dt>
              <dd>{data.locale}</dd>
              <dt>Plan</dt>
              <dd>
                <StatusPill tone={data.plan === 'PREMIUM' ? 'info' : 'neutral'}>
                  {PLAN_LABELS[data.plan]}
                </StatusPill>
              </dd>
              <dt>Kayıt</dt>
              <dd>{formatDateTime(data.createdAt)}</dd>
              <dt>Silinme</dt>
              <dd>
                {data.deletedAt != null ? (
                  <StatusPill tone="danger">{formatDateTime(data.deletedAt)}</StatusPill>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
          </div>

          <div className="card">
            <h3>Çocuklar ({data.children.length})</h3>
            {data.children.length === 0 ? (
              <p className="cell-muted">Kayıtlı çocuk yok</p>
            ) : (
              <ul className="list-plain">
                {data.children.map((child) => (
                  <li key={child.id}>
                    <span>{child.name}</span>
                    <StatusPill tone="neutral">{child.ageRange}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Ses Profilleri ({data.voiceProfiles.length})</h3>
            {data.voiceProfiles.length === 0 ? (
              <p className="cell-muted">Ses profili yok</p>
            ) : (
              <ul className="list-plain">
                {data.voiceProfiles.map((voice) => (
                  <li key={voice.id}>
                    <span>{voice.displayName}</span>
                    <StatusPill tone={voice.status === 'READY' ? 'success' : 'neutral'}>
                      {voice.status}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Siparişler ({data.orders.length})</h3>
            {data.orders.length === 0 ? (
              <p className="cell-muted">Sipariş yok</p>
            ) : (
              <ul className="list-plain">
                {data.orders.map((order) => (
                  <li key={order.id}>
                    <span className="cell-mono">{order.orderNumber}</span>
                    <span>{formatMoney(order.total)}</span>
                    <StatusPill tone={ORDER_STATUS_TONES[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Abonelik</h3>
            {data.subscription == null ? (
              <p className="cell-muted">Abonelik kaydı yok</p>
            ) : (
              <dl className="kv">
                <dt>Plan</dt>
                <dd>
                  <StatusPill tone={data.subscription.plan === 'PREMIUM' ? 'info' : 'neutral'}>
                    {PLAN_LABELS[data.subscription.plan]}
                  </StatusPill>
                </dd>
                <dt>Durum</dt>
                <dd>{data.subscription.status}</dd>
                <dt>Bitiş</dt>
                <dd>
                  {data.subscription.expiresAt != null
                    ? formatDateTime(data.subscription.expiresAt)
                    : '—'}
                </dd>
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
