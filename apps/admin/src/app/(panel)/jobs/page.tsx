'use client';

import { useState } from 'react';
import { AIJobStatus, AIJobType } from '@masalim/types';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime, JOB_STATUS_LABELS, JOB_STATUS_TONES, JOB_TYPE_LABELS, shortId } from '@/lib/labels';
import { Pagination } from '@/components/Pagination';
import { StatusPill } from '@/components/StatusPill';
import { TableStatus } from '@/components/TableStatus';

const PAGE_SIZE = 20;
const RETRYABLE: string[] = [AIJobStatus.FAILED, AIJobStatus.CANCELLED];

export default function JobsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi(
    () =>
      api.listJobs({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        type: type || undefined,
      }),
    [page, status, type],
  );

  async function handleRetry(jobId: string) {
    if (!window.confirm('Bu iş yeniden kuyruğa alınsın mı?')) return;
    setActionError(null);
    setRetryingId(jobId);
    try {
      await api.retryJob(jobId);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>İşler</h1>
      </div>
      <div className="toolbar">
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          aria-label="Durum filtresi"
        >
          <option value="">Tüm durumlar</option>
          {Object.values(AIJobStatus).map((value) => (
            <option key={value} value={value}>
              {JOB_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(event) => {
            setPage(1);
            setType(event.target.value);
          }}
          aria-label="Tür filtresi"
        >
          <option value="">Tüm türler</option>
          {Object.values(AIJobType).map((value) => (
            <option key={value} value={value}>
              {JOB_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {actionError != null && <p className="form-error">{actionError}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>İş</th>
              <th>Tür</th>
              <th>Durum</th>
              <th>İlerleme</th>
              <th>Deneme</th>
              <th>Hata</th>
              <th>Güncelleme</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={8}
              loading={loading}
              error={error}
              isEmpty={data != null && data.items.length === 0}
              emptyText="İş bulunamadı"
            />
            {!loading &&
              error == null &&
              data?.items.map((job) => (
                <tr key={job.id}>
                  <td className="cell-mono" title={job.id}>
                    {shortId(job.id)}
                  </td>
                  <td>{JOB_TYPE_LABELS[job.type]}</td>
                  <td>
                    <StatusPill tone={JOB_STATUS_TONES[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </StatusPill>
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress">
                        <span style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
                      </div>
                      <em>%{job.progress}</em>
                    </div>
                  </td>
                  <td>{job.attempts}</td>
                  <td className="error-detail">
                    {job.errorCode != null || job.errorMessage != null ? (
                      <details className="meta">
                        <summary>{job.errorCode ?? 'HATA'}</summary>
                        <code>{job.errorMessage ?? '—'}</code>
                      </details>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                  <td className="cell-nowrap cell-muted">{formatDateTime(job.updatedAt)}</td>
                  <td>
                    {RETRYABLE.includes(job.status) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={retryingId === job.id}
                        onClick={() => handleRetry(job.id)}
                      >
                        {retryingId === job.id ? 'Gönderiliyor…' : 'Yeniden Dene'}
                      </button>
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
