import { eq, desc } from 'drizzle-orm';
import { db } from '../database';
import { movements } from '../database/schema/movements';
import { products } from '../database/schema/products';
import type { MovementRepository, CreateMovementData, MovementFilters } from '../../domain/interfaces/movement-repository';
import type { Movement } from '../../domain/entities/movement';

export class DrizzleMovementRepository implements MovementRepository {

  async createEntry(data: CreateMovementData): Promise<Movement> {
    return db.transaction(async (tx) => {
      // 1. Verificar que el producto exista
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, data.productId));

      if (!product) {
        throw new Error('Product not found');
      }

      // 2. Crear el movimiento
      const [movement] = await tx
        .insert(movements)
        .values({
          productId: data.productId,
          userId: data.userId,
          type: 'IN',
          quantity: data.quantity,
          reason: data.reason,
        })
        .returning();

      // 3. Sumar stock
      await tx
        .update(products)
        .set({
          stock: product.stock + data.quantity,
          updatedAt: new Date(),
        })
        .where(eq(products.id, data.productId));

      return this.toDomain(movement);
    });
  }

  async createExit(data: CreateMovementData): Promise<Movement> {
    return db.transaction(async (tx) => {
      // 1. Verificar que el producto exista
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, data.productId));

      if (!product) {
        throw new Error('Product not found');
      }

      // 2. Verificar stock suficiente
      if (product.stock < data.quantity) {
        throw new Error('Insufficient stock');
      }

      // 3. Crear el movimiento
      const [movement] = await tx
        .insert(movements)
        .values({
          productId: data.productId,
          userId: data.userId,
          type: 'OUT',
          quantity: data.quantity,
          reason: data.reason,
        })
        .returning();

      // 4. Restar stock
      await tx
        .update(products)
        .set({
          stock: product.stock - data.quantity,
          updatedAt: new Date(),
        })
        .where(eq(products.id, data.productId));

      return this.toDomain(movement);
    });
  }

  async findByProductId(productId: string): Promise<Movement[]> {
    const results = await db
      .select()
      .from(movements)
      .where(eq(movements.productId, productId))
      .orderBy(desc(movements.createdAt));

    return results.map((r) => this.toDomain(r));
  }

  async findAll(filters?: MovementFilters): Promise<Movement[]> {
    const { offset, limit } = this.buildPagination(filters);

    const results = await db
      .select()
      .from(movements)
      .orderBy(desc(movements.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => this.toDomain(r));
  }

  private toDomain(row: typeof movements.$inferSelect): Movement {
    return {
      id: row.id,
      productId: row.productId,
      userId: row.userId,
      type: row.type as Movement['type'],
      quantity: row.quantity,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  private buildPagination(filters?: MovementFilters) {
    const limit = filters?.limit ?? 20;
    const page = filters?.page ?? 1;
    const offset = (page - 1) * limit;
    return { offset, limit };
  }
}