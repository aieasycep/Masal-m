'use client';

import { useState } from 'react';
import { OrderStatus } from '@masalim/types';
import { api, errorMessage, type AdminOrderRow } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import {
  formatDateTime,
  formatMoney,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '@/lib/labels';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { StatusPill } from '@/components/StatusPill';
import { TableStatus } from '@/components/TableStatus';

const PAGE_SIZE = 20;

function isOrderStatus(value: string): value is OrderStatus {
  return Object.values(OrderStatus).includes(value as OrderStatus);
}

function OrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: AdminOrderRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(
    isOrderStatus(order.status) ? order.status : OrderStatus.PENDING,
  );
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const trimmed = trackingNumber.trim();
      await api.patchOrder(order.id, {
        status,
        trackingNumber: trimmed === '' ? null : trimmed,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Sipariş ${order.orderNumber}`} onClose={onClose}>
      <p className="cell-muted" style={{ marginTop: 0 }}>
        {order.bookTitle} · {order.userEmail} · {formatMoney(order.total)}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="order-status">Durum</label>
          <select
            id="order-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatus)}
          >
            {Object.values(OrderStatus).map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="order-tracking">Kargo takip numarası</label>
          <input
            id="order-tracking"
            type="text"
            maxLength={60}
            placeholder="Takip numarası (boş bırakılabilir)"
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
          />
        </div>
        {error != null && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminOrderRow | null>(null);

  const { data, loading, error, reload } = useApi(
    () =>
      api.listOrders({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        search: search || undefined,
      }),
    [page, status, search],
  );

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div>
      <div className="page-head">
        <h1>Siparişler</h1>
      </div>
      <form className="toolbar" onSubmit={applySearch}>
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          aria-label="Durum filtresi"
        >
          <option value="">Tüm durumlar</option>
          {Object.values(OrderStatus).map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Sipariş numarası ile ara…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit" className="btn btn-outline">
          Ara
        </button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Kullanıcı</th>
              <th>Kitap</th>
              <th>Adet</th>
              <th>Tutar</th>
              <th>Durum</th>
              <th>Ödeme</th>
              <th>Takip No</th>
              <th>Tarih</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={10}
              loading={loading}
              error={error}
              isEmpty={data != null && data.items.length === 0}
              emptyText="Sipariş bulunamadı"
            />
            {!loading &&
              error == null &&
              data?.items.map((order) => (
                <tr key={order.id}>
                  <td className="cell-mono">{order.orderNumber}</td>
                  <td className="cell-muted">{order.userEmail}</td>
                  <td>{order.bookTitle}</td>
                  <td>{order.quantity}</td>
                  <td className="cell-nowrap">{formatMoney(order.total)}</td>
                  <td>
                    {isOrderStatus(order.status) ? (
                      <StatusPill tone={ORDER_STATUS_TONES[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </StatusPill>
                    ) : (
                      <StatusPill tone="neutral">{order.status}</StatusPill>
                    )}
                  </td>
                  <td>
                    <StatusPill tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </StatusPill>
                  </td>
                  <td className="cell-mono">{order.trackingNumber ?? '—'}</td>
                  <td className="cell-nowrap cell-muted">{formatDateTime(order.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditing(order)}
                    >
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {data != null && <Pagination meta={data.meta} onPage={setPage} />}
      {editing != null && (
        <OrderModal
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
