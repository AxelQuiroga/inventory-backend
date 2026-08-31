import { pgTable, uuid, varchar, text, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products.js';
import { users } from './users.js';

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
}

export const movements = pgTable('movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 10 }).notNull(), // 'IN' o 'OUT'
  quantity: integer('quantity').notNull(),
  reason: text('reason').notNull(), // Motivo del movimiento
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('movement_type_check', sql`${table.type} IN ('IN', 'OUT')`),
  check('movements_quantity_positive', sql`${table.quantity} > 0`),
]);