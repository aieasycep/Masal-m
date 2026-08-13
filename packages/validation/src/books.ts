import { z } from 'zod';
import { BookPageLayout, BookStatus } from '@masalim/types';

export const bookStatusSchema = z.nativeEnum(BookStatus);
export const bookPageLayoutSchema = z.nativeEnum(BookPageLayout);

export const createBookSchema = z.object({
  storyId: z.string().cuid(),
  illustrationSetId: z.string().cuid().optional(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

/** Autosave patch from the Book Builder (debounced client-side). */
export const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    subtitle: z.string().trim().max(160).nullable(),
    dedication: z.string().trim().max(300).nullable(),
    backCoverText: z.string().trim().max(600).nullable(),
    coverIllustrationId: z.string().cuid().nullable(),
    pages: z.array(
      z.object({
        id: z.string().cuid(),
        text: z.string().trim().min(1).max(2000).optional(),
        illustrationId: z.string().cuid().nullable().optional(),
        layout: bookPageLayoutSchema.optional(),
      }),
    ),
  })
  .partial();
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export const bookPageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int(),
  storyPageId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  text: z.string(),
  layout: bookPageLayoutSchema,
});
export type BookPage = z.infer<typeof bookPageSchema>;

export const bookSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  storyVersion: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  dedication: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  backCoverText: z.string().nullable(),
  status: bookStatusSchema,
  pages: z.array(bookPageSchema),
  printPdfUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Book = z.infer<typeof bookSchema>;

export const renderBookSchema = z.object({
  kind: z.enum(['digital_preview', 'print_pdf']),
});
export type RenderBookInput = z.infer<typeof renderBookSchema>;
