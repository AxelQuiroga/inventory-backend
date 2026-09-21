import { z } from 'zod';

// La venta llega como líneas { productId, quantity }: el precio NO viaja en
// el request. Se lee del producto al confirmar (congelado en la línea).
export const createSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product ID'),
        quantity: z.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1'),
      }),
    )
    .min(1, 'A sale needs at least one item'),
});

// Params de rutas con :id — un UUID malformado debe dar 400, no 500.
export const saleParamsSchema = z.object({
  id: z.string().uuid('Invalid sale ID'),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;