import { z } from 'zod';
import { BookSize, CoverType, OrderStatus, PaymentStatus } from '@masalim/types';
import { personNameSchema } from './common';

export const bookSizeSchema = z.nativeEnum(BookSize);
export const coverTypeSchema = z.nativeEnum(CoverType);
export const orderStatusSchema = z.nativeEnum(OrderStatus);
export const paymentStatusSchema = z.nativeEnum(PaymentStatus);

/** Turkish phone: +90XXXXXXXXXX or 0XXXXXXXXXX (10 digits after prefix). */
export const turkishPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+90|0)?5\d{9}$/, 'invalid_phone');

export const createAddressSchema = z.object({
  fullName: personNameSchema,
  phone: turkishPhoneSchema,
  addressLine: z.string().trim().min(10).max(300),
  city: z.string().trim().min(2).max(40),
  district: z.string().trim().min(2).max(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'invalid_postal_code'),
  isDefault: z.boolean().default(false),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const addressSchema = createAddressSchema.extend({
  id: z.string(),
});
export type Address = z.infer<typeof addressSchema>;

/** Client sends configuration only — never a price (§82). */
export const orderConfigurationSchema = z.object({
  bookId: z.string().cuid(),
  quantity: z.number().int().min(1).max(20),
  bookSize: bookSizeSchema,
  coverType: coverTypeSchema,
});
export type OrderConfiguration = z.infer<typeof orderConfigurationSchema>;

export const orderQuoteSchema = z.object({
  subtotal: z.string(),
  shipping: z.string(),
  total: z.string(),
  currency: z.literal('TRY'),
  estimatedDeliveryDays: z.object({ min: z.number().int(), max: z.number().int() }),
});
export type OrderQuote = z.infer<typeof orderQuoteSchema>;

export const createOrderSchema = orderConfigurationSchema.extend({
  shippingAddressId: z.string().cuid(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  bookId: z.string(),
  bookTitle: z.string(),
  coverImageUrl: z.string().nullable(),
  quantity: z.number().int(),
  bookSize: bookSizeSchema,
  coverType: coverTypeSchema,
  subtotal: z.string(),
  shipping: z.string(),
  total: z.string(),
  currency: z.literal('TRY'),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  shippingAddress: addressSchema.nullable(),
  trackingNumber: z.string().nullable(),
  createdAt: z.string(),
  timeline: z.array(
    z.object({ status: orderStatusSchema, at: z.string() }),
  ),
});
export type Order = z.infer<typeof orderSchema>;

export const initPaymentResponseSchema = z.object({
  provider: z.string(),
  /** iyzico checkout form URL or token; mock provider returns a fake completion token. */
  checkoutUrl: z.string().nullable(),
  paymentId: z.string(),
});
export type InitPaymentResponse = z.infer<typeof initPaymentResponseSchema>;
