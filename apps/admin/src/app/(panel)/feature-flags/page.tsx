'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { StatusPill } from '@/components/StatusPill';

export default function FeatureFlagsPage() {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi(() => api.listFeatureFlags(), []);

  async function handleToggle(key: string, enabled: boolean) {
    setActionError(null);
    setSavingKey(key);
    try {
      await api.patchFeatureFlag(key, enabled);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Özellik Bayrakları</h1>
      </div>
      {actionError != null && <p className="form-error">{actionError}</p>}
      {loading && <div className="card state">Yükleniyor…</div>}
      {error != null && <div className="card state state-error">{error}</div>}
      {data != null && (
        <div className="table-wrap">
          {data.length === 0 && <div className="state">Özellik bayrağı yok</div>}
          {data.map((flag) => (
            <div key={flag.key} className="flag-row">
              <div>
                <div className="flag-key">
                  {flag.key}{' '}
                  {flag.isPublic && <StatusPill tone="info">Herkese açık</StatusPill>}
                </div>
                <div className="flag-desc">{flag.description}</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  disabled={savingKey === flag.key}
                  onChange={(event) => handleToggle(flag.key, event.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
