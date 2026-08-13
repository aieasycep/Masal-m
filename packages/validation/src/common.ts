import { z } from 'zod';
import { PAGINATION } from '@masalim/types';

export const idSchema = z.string().cuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginatedMeta = z.infer<typeof paginatedMetaSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    meta: paginatedMetaSchema,
  });
}

/** Turkish-friendly human name: letters (incl. Turkish), spaces, hyphens, apostrophes. */
export const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}][\p{L}\p{M}' \-.]*$/u, 'invalid_name');

export const localeSchema = z.enum(['tr', 'en']);

export const urlSchema = z.string().url().max(2048);

export const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
