'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime } from '@/lib/labels';
import { Pagination } from '@/components/Pagination';
import { TableStatus } from '@/components/TableStatus';

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);

  const { data, loading, error } = useApi(
    () => api.listAuditLogs({ page, pageSize: PAGE_SIZE }),
    [page],
  );

  return (
    <div>
      <div className="page-head">
        <h1>Denetim Kaydı</h1>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Yönetici</th>
              <th>Eylem</th>
              <th>Varlık</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={5}
              loading={loading}
              error={error}
              isEmpty={data != null && data.items.length === 0}
              emptyText="Denetim kaydı yok"
            />
            {!loading &&
              error == null &&
              data?.items.map((log) => (
                <tr key={log.id}>
                  <td className="cell-nowrap cell-muted">{formatDateTime(log.createdAt)}</td>
                  <td>{log.adminEmail ?? '—'}</td>
                  <td className="cell-mono">{log.action}</td>
                  <td>
                    {log.entityType}
                    {log.entityId != null && (
                      <span className="cell-muted cell-mono"> · {log.entityId}</span>
                    )}
                  </td>
                  <td>
                    {Object.keys(log.metadata).length > 0 ? (
                      <details className="meta">
                        <summary>JSON</summary>
                        <pre className="json">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="cell-muted">—</span>
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
