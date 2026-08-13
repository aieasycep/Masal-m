/**
 * Loading / error / empty rows for tables. Render inside <tbody>; returns null
 * when data is present so the caller can list real rows right after it.
 */
export function TableStatus({
  colSpan,
  loading,
  error,
  isEmpty,
  emptyText = 'Kayıt bulunamadı',
}: {
  colSpan: number;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className="state">
          Yükleniyor…
        </td>
      </tr>
    );
  }
  if (error != null) {
    return (
      <tr>
        <td colSpan={colSpan} className="state state-error">
          {error}
        </td>
      </tr>
    );
  }
  if (isEmpty) {
    return (
      <tr>
        <td colSpan={colSpan} className="state">
          {emptyText}
        </td>
      </tr>
    );
  }
  return null;
}
