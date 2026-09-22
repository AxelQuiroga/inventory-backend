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

// Query de GET /movements (vista global) — paginación + filtros del contrato.
// type/productId filtran para cualquier rol; userId SOLO tiene efecto para el
// ADMIN (el use case lo descarta para OPERATOR/VIEWER).
export const movementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  type: z.enum(['IN', 'OUT']).optional(),
  productId: z.string().uuid('Invalid product ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
});

export type MovementsQuery = z.infer<typeof movementsQuerySchema>;