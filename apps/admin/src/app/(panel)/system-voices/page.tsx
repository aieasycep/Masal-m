'use client';

import { useState } from 'react';
import { SystemVoiceCategory } from '@masalim/types';
import type { AdminSystemVoiceUpsertInput } from '@masalim/validation';
import { api, errorMessage, type AdminSystemVoice } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { VOICE_CATEGORY_LABELS } from '@/lib/labels';
import { Modal } from '@/components/Modal';
import { StatusPill } from '@/components/StatusPill';
import { TableStatus } from '@/components/TableStatus';

const EMPTY_FORM: AdminSystemVoiceUpsertInput = {
  displayName: '',
  description: '',
  category: SystemVoiceCategory.CALM,
  provider: 'elevenlabs',
  providerVoiceId: '',
  enabled: true,
  premiumOnly: false,
  sortOrder: 0,
};

function VoiceModal({
  voice,
  onClose,
  onSaved,
}: {
  voice: AdminSystemVoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AdminSystemVoiceUpsertInput>(
    voice != null
      ? {
          displayName: voice.displayName,
          description: voice.description,
          category: voice.category,
          provider: voice.provider,
          providerVoiceId: voice.providerVoiceId,
          enabled: voice.enabled,
          premiumOnly: voice.premiumOnly,
          sortOrder: voice.sortOrder,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminSystemVoiceUpsertInput>(
    key: K,
    value: AdminSystemVoiceUpsertInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (voice != null) {
        await api.updateSystemVoice(voice.id, form);
      } else {
        await api.createSystemVoice(form);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={voice != null ? 'Sesi Düzenle' : 'Yeni Ses'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="voice-name">Görünen ad</label>
          <input
            id="voice-name"
            type="text"
            required
            maxLength={60}
            value={form.displayName}
            onChange={(event) => set('displayName', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="voice-desc">Açıklama</label>
          <textarea
            id="voice-desc"
            required
            maxLength={200}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="voice-category">Kategori</label>
            <select
              id="voice-category"
              value={form.category}
              onChange={(event) => set('category', event.target.value as SystemVoiceCategory)}
            >
              {Object.values(SystemVoiceCategory).map((value) => (
                <option key={value} value={value}>
                  {VOICE_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="voice-sort">Sıra</label>
            <input
              id="voice-sort"
              type="number"
              min={0}
              max={1000}
              required
              value={form.sortOrder}
              onChange={(event) => set('sortOrder', Number(event.target.value))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="voice-provider">Sağlayıcı</label>
            <input
              id="voice-provider"
              type="text"
              required
              maxLength={40}
              value={form.provider}
              onChange={(event) => set('provider', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="voice-provider-id">Sağlayıcı ses kimliği</label>
            <input
              id="voice-provider-id"
              type="text"
              required
              maxLength={120}
              value={form.providerVoiceId}
              onChange={(event) => set('providerVoiceId', event.target.value)}
            />
          </div>
        </div>
        <label className="field-check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => set('enabled', event.target.checked)}
          />
          Aktif
        </label>
        <label className="field-check">
          <input
            type="checkbox"
            checked={form.premiumOnly}
            onChange={(event) => set('premiumOnly', event.target.checked)}
          />
          Sadece Premium
        </label>
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

export default function SystemVoicesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSystemVoice | null>(null);

  const { data, loading, error, reload } = useApi(() => api.listSystemVoices(), []);

  return (
    <div>
      <div className="page-head">
        <h1>Sistem Sesleri</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + Yeni Ses
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Sıra</th>
              <th>Ad</th>
              <th>Kategori</th>
              <th>Sağlayıcı</th>
              <th>Ses Kimliği</th>
              <th>Durum</th>
              <th>Premium</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <TableStatus
              colSpan={8}
              loading={loading}
              error={error}
              isEmpty={data != null && data.length === 0}
              emptyText="Sistem sesi yok"
            />
            {!loading &&
              error == null &&
              data?.map((voice) => (
                <tr key={voice.id}>
                  <td>{voice.sortOrder}</td>
                  <td>
                    <strong>{voice.displayName}</strong>
                    <div className="cell-muted" style={{ fontSize: 12 }}>
                      {voice.description}
                    </div>
                  </td>
                  <td>
                    <StatusPill tone="info">{VOICE_CATEGORY_LABELS[voice.category]}</StatusPill>
                  </td>
                  <td className="cell-muted">{voice.provider}</td>
                  <td className="cell-mono">{voice.providerVoiceId}</td>
                  <td>
                    {voice.enabled ? (
                      <StatusPill tone="success">Aktif</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">Pasif</StatusPill>
                    )}
                  </td>
                  <td>
                    {voice.premiumOnly ? (
                      <StatusPill tone="warning">Premium</StatusPill>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setEditing(voice);
                        setModalOpen(true);
                      }}
                    >
                      Düzenle
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {modalOpen && (
        <VoiceModal
          voice={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
