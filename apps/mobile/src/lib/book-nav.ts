import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from './api';

/**
 * "Kitap Yap": reuse the story's existing book if one exists, otherwise create
 * one, then open the book builder. Shared by the story result screen and the
 * illustration flow's "Kitabı Oluştur" CTA. Errors propagate to the caller
 * (screens map them to i18n copy); the shared ['books'] cache is refreshed
 * after a create.
 */
export async function openBookBuilderForStory(
  queryClient: QueryClient,
  storyId: string,
): Promise<void> {
  const books = await queryClient.fetchQuery({
    queryKey: ['books'],
    queryFn: () => api.books.list(),
  });
  const existing = books.find((book) => book.storyId === storyId);
  if (existing != null) {
    router.push(`/book/${existing.id}/builder` as never);
    return;
  }
  const created = await api.books.create({ storyId });
  void queryClient.invalidateQueries({ queryKey: ['books'] });
  router.push(`/book/${created.id}/builder` as never);
}
