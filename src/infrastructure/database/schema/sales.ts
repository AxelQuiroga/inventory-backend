import { pgTable, uuid, integer, numeric, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products.js';
import { users } from './users.js';

// Una venta agrupa N líneas (sale_items). El stock NO se descuenta al armar
// la venta en la UI: el carrito es local del navegador. El descuento ocurre
// UNA sola vez, atómicamente, cuando la venta se confirma (POST /sales):
// cada línea valida stock disponible y lo descuenta, y por cada línea queda
// un movimiento OUT (trazabilidad completa con el historial del producto).
export const sales = pgTable('sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  // Precio congelado al momento de la venta: si el producto sube mañana,
  // las ventas históricas no cambian. El total de la línea se deriva
  // (quantity * unit_price), nunca se almacena.
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  check('sale_items_quantity_positive', sql`${table.quantity} > 0`),
  check('sale_items_unit_price_positive', sql`${table.unitPrice} > 0`),
]);