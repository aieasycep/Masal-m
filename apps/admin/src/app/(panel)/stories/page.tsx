'use client';

import { useState } from 'react';
import { ModerationStatus, StoryStatus } from '@masalim/types';
import type { AdminStory } from '@masalim/validation';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import {
  formatDateTime,
  MODERATION_STATUS_LABELS,
  MODERATION_STATUS_TONES,
  STORY_STATUS_LABELS,
  STORY_STATUS_TONES,
} from '@/lib/labels';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { StatusPill } from '@/components/StatusPill';
import { TableStatus } from '@/components/TableStatus';

const PAGE_SIZE = 20;

function ModerationModal({
  story,
  onClose,
  onSaved,
}: {
  story: AdminStory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>(
    story.moderationStatus,
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patchModeration(story.id, { moderationStatus, reason: reason.trim() });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title="Moderasyon Kararı" onClose={onClose}>
      <p className="cell-muted" style={{ marginTop: 0 }}>
        {story.title} · {story.userEmail}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="moderation-status">Yeni durum</label>
          <select
            id="moderation-status"
            value={moderationStatus}
            onChange={(event) => setModerationStatus(event.target.value as ModerationStatus)}
          >
            {Object.values(ModerationStatus).map((value) => (
              <option key={value} value={value}>
                {MODERATION_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="moderation-reason">Gerekçe (zorunlu)</label>
          <textarea
            id="moderation-reason"
            required
            minLength={3}
            maxLength={300}
            placeholder="Kararın gerekçesini yazın…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
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

export default function StoriesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [moderationStatus, setModerationStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminStory | null>(null);

  const { data, loading, error, reload } = useApi(
    () =>
      api.listStories({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        moderationStatus: moderationStatus || undefined,
        search: search || undefined,
      }),
    [page, status, moderationStatus, search],
  );

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div>
      <div className="page-head">
        <h1>Hikâyeler</h1>
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
          {Object.values(StoryStatus).map((value) => (
            <option key={value} value={value}>
              {STORY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={moderationStatus}
          onChange={(event) => {
            setPage(1);
            setModerationStatus(event.target.value);
          }}
          aria-label="Moderasyon filtresi"
        >
          <option value="">Tüm moderasyon durumları</option>
          {Object.values(ModerationStatus).map((value) => (
            <option key={value} value={value}>
              {MODERATION_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Başlık veya e-posta ile ara…"
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
              <th>Başlık</th>
              <th>Kullanıcı</th>
              <th>Durum</th>
              <th>Moderasyon</th>
              <th>Temalar</th>
              <th>Dil</th>
              <th>Oluşturulma</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={8}
              loading={loading}
              error={error}
              isEmpty={data != null && data.items.length === 0}
              emptyText="Hikâye bulunamadı"
            />
            {!loading &&
              error == null &&
              data?.items.map((story) => (
                <tr key={story.id}>
                  <td>{story.title}</td>
                  <td className="cell-muted">{story.userEmail}</td>
                  <td>
                    <StatusPill tone={STORY_STATUS_TONES[story.status]}>
                      {STORY_STATUS_LABELS[story.status]}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={MODERATION_STATUS_TONES[story.moderationStatus]}>
                      {MODERATION_STATUS_LABELS[story.moderationStatus]}
                    </StatusPill>
                  </td>
                  <td className="cell-muted">{story.themes.join(', ') || '—'}</td>
                  <td className="cell-muted">{story.language}</td>
                  <td className="cell-nowrap cell-muted">{formatDateTime(story.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditing(story)}
                    >
                      Moderasyon
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {data != null && <Pagination meta={data.meta} onPage={setPage} />}
      {editing != null && (
        <ModerationModal
          story={editing}
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
