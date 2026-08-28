'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate, PLAN_LABELS } from '@/lib/labels';
import { Pagination } from '@/components/Pagination';
import { StatusPill } from '@/components/StatusPill';
import { TableStatus } from '@/components/TableStatus';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error } = useApi(
    () => api.listUsers({ page, pageSize: PAGE_SIZE, search: search || undefined }),
    [page, search],
  );

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div>
      <div className="page-head">
        <h1>Kullanıcılar</h1>
      </div>
      <form className="toolbar" onSubmit={applySearch}>
        <input
          type="search"
          placeholder="E-posta veya isimle ara…"
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
              <th>E-posta</th>
              <th>İsim</th>
              <th>Dil</th>
              <th>Plan</th>
              <th>Çocuk</th>
              <th>Hikâye</th>
              <th>Kayıt</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={8}
              loading={loading}
              error={error}
              isEmpty={data != null && data.items.length === 0}
              emptyText="Kullanıcı bulunamadı"
            />
            {!loading &&
              error == null &&
              data?.items.map((user) => (
                <tr
                  key={user.id}
                  className="row-link"
                  onClick={() => router.push(`/users/${user.id}`)}
                >
                  <td>{user.email}</td>
                  <td>{user.name}</td>
                  <td className="cell-muted">{user.locale}</td>
                  <td>
                    <StatusPill tone={user.plan === 'PREMIUM' ? 'info' : 'neutral'}>
                      {PLAN_LABELS[user.plan]}
                    </StatusPill>
                  </td>
                  <td>{user.childCount}</td>
                  <td>{user.storyCount}</td>
                  <td className="cell-nowrap cell-muted">{formatDate(user.createdAt)}</td>
                  <td>
                    {user.deletedAt != null ? (
                      <StatusPill tone="danger">Silinmiş</StatusPill>
                    ) : (
                      <StatusPill tone="success">Aktif</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {data != null && <Pagination meta={data.meta} onPage={setPage} />}
    </div>
  );
}
