'use client';

import type { PaginatedMeta } from '@masalim/validation';

export function Pagination({
  meta,
  onPage,
}: {
  meta: PaginatedMeta;
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        ← Önceki
      </button>
      <span className="pagination-info">
        Sayfa {meta.page} / {meta.totalPages} · {meta.totalItems} kayıt
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        Sonraki →
      </button>
    </div>
  );
}
