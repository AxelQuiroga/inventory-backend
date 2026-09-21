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

// Query de GET /movements/history/:productId — paginación con defaults y cap,
// coherente con productQuerySchema (page/limit).
export const movementHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type MovementHistoryQuery = z.infer<typeof movementHistoryQuerySchema>;