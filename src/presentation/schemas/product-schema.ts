import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  sku: z.string().min(1, 'SKU is required'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().positive('Price must be positive'),
  // stock NO se crea con el producto: el stock inicial entra vía un
  // movimiento IN (razón "Stock inicial"). Invariante: todo cambio de
  // stock genera un movimiento.
  minStock: z.number().int().min(0, 'Min stock cannot be negative').default(5),
  // Stock inicial cargado en la creación: se materializa como un movimiento
  // IN ("Stock inicial") en la MISMA transacción (nunca stock directo).
  initialStock: z.number().int('Initial stock must be an integer').min(0, 'Initial stock cannot be negative').optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sku: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  //stock: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  lowStock: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'price', 'stock', 'createdAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(20),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;

// Params de rutas con :id — un UUID malformado debe dar 400, no 500.
export const productParamsSchema = z.object({
  id: z.string().uuid('Invalid product ID'),
});