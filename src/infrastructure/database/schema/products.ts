import { pgTable, uuid, varchar, text, numeric, integer, timestamp, boolean, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').default(''),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  category: varchar('category', { length: 100 }).notNull(),
  unit: varchar('unit', { length: 50 }).notNull(), // 'pieza', 'kg', 'litro', etc.
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  stock: integer('stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(5),
  active: boolean('active').notNull().default(true), // Soft delete: false = desactivado
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  check('products_stock_non_negative', sql`${table.stock} >= 0`),
]);