'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { clearSession } from '@/lib/auth';
import { ADMIN_ROLE_LABELS } from '@/lib/labels';
import { StatusPill } from '@/components/StatusPill';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function changePasswordError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'AUTH_INVALID_CREDENTIALS') return 'Mevcut şifre hatalı.';
    if (error.code === 'VALIDATION_FAILED') return 'Yeni şifre mevcut şifreyle aynı olamaz.';
  }
  return errorMessage(error);
}

export default function SettingsPage() {
  const router = useRouter();
  const me = useApi(() => api.me(), []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function validate(): string | null {
    if (currentPassword.length === 0) return 'Mevcut şifreni gir.';
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return `Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return `Yeni şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`;
    }
    if (newPassword === currentPassword) return 'Yeni şifre mevcut şifreyle aynı olamaz.';
    if (newPassword !== newPasswordRepeat) return 'Yeni şifreler birbiriyle eşleşmiyor.';
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    const clientError = validate();
    if (clientError != null) {
      setError(clientError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordRepeat('');
      setSuccess('Şifren güncellendi. Bir sonraki girişte yeni şifreni kullan.');
    } catch (err) {
      // The call skips the global 401 redirect so a wrong current password can be
      // shown inline; any other 401 still means the session itself is gone.
      if (err instanceof ApiError && err.status === 401 && err.code !== 'AUTH_INVALID_CREDENTIALS') {
        clearSession();
        router.replace('/login');
        return;
      }
      setError(changePasswordError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Ayarlar</h1>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Hesabım</h3>
        {me.loading && <div className="state">Yükleniyor…</div>}
        {me.error != null && <div className="state state-error">{me.error}</div>}
        {me.data != null && (
          <div>
            <div>
              <strong>{me.data.name}</strong>{' '}
              <StatusPill tone="info">{ADMIN_ROLE_LABELS[me.data.role]}</StatusPill>
            </div>
            <div className="cell-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {me.data.email}
            </div>
          </div>
        )}
      </div>

      <form className="card" style={{ maxWidth: 480 }} onSubmit={handleSubmit}>
        <h3 style={{ marginTop: 0 }}>Şifre değiştir</h3>
        <div className="field">
          <label htmlFor="current-password">Mevcut şifre</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">Yeni şifre (en az {MIN_PASSWORD_LENGTH} karakter)</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password-repeat">Yeni şifre (tekrar)</label>
          <input
            id="new-password-repeat"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={newPasswordRepeat}
            onChange={(event) => setNewPasswordRepeat(event.target.value)}
          />
        </div>
        {error != null && <p className="form-error">{error}</p>}
        {success != null && (
          <p style={{ fontSize: 13, margin: '4px 0 10px' }}>
            <StatusPill tone="success">{success}</StatusPill>
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Şifreyi Güncelle'}
          </button>
        </div>
      </form>
    </div>
  );
}
