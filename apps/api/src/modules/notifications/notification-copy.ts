import { NotificationType } from '@masalim/types';

interface CopyInput {
  storyTitle?: string;
  voiceName?: string;
  orderNumber?: string;
}

type Copy = { title: string; body: string };

/**
 * Server-composed notification copy (push + in-app center). The design's
 * verbatim strings live here per locale; user.locale picks the language.
 */
const COPY: Record<'tr' | 'en', Record<NotificationType, (input: CopyInput) => Copy>> = {
  tr: {
    [NotificationType.STORY_READY]: ({ storyTitle }) => ({
      title: 'Masalın hazır ✨',
      body: storyTitle ? `“${storyTitle}” seni bekliyor.` : 'Yeni masalın seni bekliyor.',
    }),
    [NotificationType.VOICE_READY]: ({ voiceName }) => ({
      title: `${voiceName ?? 'Sesin'} hazır 🎉`,
      body: 'Artık masalları bu sesle anlatabilirsin.',
    }),
    [NotificationType.ILLUSTRATIONS_READY]: ({ storyTitle }) => ({
      title: 'Görsellerin hazır 🎨',
      body: storyTitle ? `“${storyTitle}” için görseller oluşturuldu.` : 'Masal görsellerin hazır.',
    }),
    [NotificationType.BOOK_READY]: ({ storyTitle }) => ({
      title: 'Kitabın hazır 📚',
      body: storyTitle ? `“${storyTitle}” kitaba dönüştü.` : 'Kitabın önizlemeye hazır.',
    }),
    [NotificationType.ORDER_SHIPPED]: ({ orderNumber }) => ({
      title: 'Siparişin kargoya verildi 📦',
      body: orderNumber ? `${orderNumber} numaralı siparişin yola çıktı.` : 'Siparişin yola çıktı.',
    }),
    [NotificationType.GENERIC]: () => ({ title: 'Masalım', body: '' }),
  },
  en: {
    [NotificationType.STORY_READY]: ({ storyTitle }) => ({
      title: 'Your story is ready ✨',
      body: storyTitle ? `“${storyTitle}” is waiting for you.` : 'Your new story is waiting.',
    }),
    [NotificationType.VOICE_READY]: ({ voiceName }) => ({
      title: `${voiceName ?? 'Your voice'} is ready 🎉`,
      body: 'You can now narrate stories with this voice.',
    }),
    [NotificationType.ILLUSTRATIONS_READY]: ({ storyTitle }) => ({
      title: 'Your illustrations are ready 🎨',
      body: storyTitle ? `Illustrations for “${storyTitle}” were created.` : 'Your story art is ready.',
    }),
    [NotificationType.BOOK_READY]: ({ storyTitle }) => ({
      title: 'Your book is ready 📚',
      body: storyTitle ? `“${storyTitle}” became a book.` : 'Your book preview is ready.',
    }),
    [NotificationType.ORDER_SHIPPED]: ({ orderNumber }) => ({
      title: 'Your order has shipped 📦',
      body: orderNumber ? `Order ${orderNumber} is on its way.` : 'Your order is on its way.',
    }),
    [NotificationType.GENERIC]: () => ({ title: 'Masalım', body: '' }),
  },
};

export function notificationCopy(
  locale: string,
  type: NotificationType,
  input: CopyInput,
): Copy {
  const lang = locale === 'en' ? 'en' : 'tr';
  return COPY[lang][type](input);
}
