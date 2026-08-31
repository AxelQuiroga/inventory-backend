import { z } from 'zod';

export const registerMovementSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().int().positive('Quantity must be positive'),
  reason: z.string().min(1, 'Reason is required'),
});

export type RegisterMovementInput = z.infer<typeof registerMovementSchema>

// Params de rutas con :productId — un UUID malformado debe dar 400, no 500.
export const movementParamsSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
});