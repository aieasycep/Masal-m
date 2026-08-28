import type {
  AdminRole,
  AIJobStatus,
  AIJobType,
  ModerationStatus,
  OrderStatus,
  PaymentStatus,
  StoryStatus,
  SubscriptionPlan,
  SystemVoiceCategory,
} from '@masalim/types';
import type { PillTone } from '@/components/StatusPill';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: 'Yönetici',
  SUPPORT: 'Destek',
  OPERATIONS: 'Operasyon',
};

export const JOB_STATUS_LABELS: Record<AIJobStatus, string> = {
  QUEUED: 'Kuyrukta',
  RUNNING: 'Çalışıyor',
  SUCCEEDED: 'Başarılı',
  FAILED: 'Başarısız',
  CANCELLED: 'İptal edildi',
};

export const JOB_STATUS_TONES: Record<AIJobStatus, PillTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};

export const JOB_TYPE_LABELS: Record<AIJobType, string> = {
  STORY_GENERATION: 'Hikâye üretimi',
  VOICE_CLONE: 'Ses klonlama',
  NARRATION_GENERATION: 'Seslendirme',
  ILLUSTRATION_GENERATION: 'Görsel üretimi',
  BOOK_RENDER: 'Kitap oluşturma',
  PRINT_FILE_GENERATION: 'Baskı dosyası',
  ORDER_SNAPSHOT: 'Sipariş anlık kaydı',
  ACCOUNT_DELETION: 'Hesap silme',
};

export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  DRAFT: 'Taslak',
  GENERATING: 'Üretiliyor',
  READY: 'Hazır',
  FAILED: 'Başarısız',
};

export const STORY_STATUS_TONES: Record<StoryStatus, PillTone> = {
  DRAFT: 'neutral',
  GENERATING: 'info',
  READY: 'success',
  FAILED: 'danger',
};

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  PENDING: 'Beklemede',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};

export const MODERATION_STATUS_TONES: Record<ModerationStatus, PillTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Beklemede',
  PAID: 'Ödendi',
  IN_PRODUCTION: 'Üretimde',
  SHIPPED: 'Kargoda',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal edildi',
  REFUNDED: 'İade edildi',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, PillTone> = {
  PENDING: 'warning',
  PAID: 'info',
  IN_PRODUCTION: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Beklemede',
  PROCESSING: 'İşleniyor',
  SUCCEEDED: 'Başarılı',
  FAILED: 'Başarısız',
  REFUNDED: 'İade edildi',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, PillTone> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

export const VOICE_CATEGORY_LABELS: Record<SystemVoiceCategory, string> = {
  CALM: 'Sakin',
  CHEERFUL: 'Neşeli',
  FAIRYTALE: 'Masalsı',
  ENERGETIC: 'Enerjik',
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: 'Ücretsiz',
  PREMIUM: 'Premium',
};

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatMoney(decimalString: string): string {
  return `${decimalString} ₺`;
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}
