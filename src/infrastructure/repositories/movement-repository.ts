import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db } from '../database';
import { movements } from '../database/schema/movements';
import { products } from '../database/schema/products';
import type { MovementRepository, CreateMovementData, MovementFilters } from '../../domain/interfaces/movement-repository';
import type { Movement } from '../../domain/entities/movement';

export class DrizzleMovementRepository implements MovementRepository {

  async createEntry(data: CreateMovementData): Promise<Movement> {
    return db.transaction(async (tx) => {
      // 1. UPDATE atómico: suma stock solo si el producto existe y está activo.
      //    La base compara contra el stock actual (no un valor leído antes),
      //    por lo que dos IN concurrentes no pierden unidades.
      const [updated] = await tx
        .update(products)
        .set({
          stock: sql`${products.stock} + ${data.quantity}`,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, data.productId), eq(products.active, true)))
        .returning();

      if (!updated) {
        // 2. Diagnóstico: distinguir 404 (no existe) de 400 (inactivo)
        const [current] = await tx
          .select()
          .from(products)
          .where(eq(products.id, data.productId));

        if (!current) {
          throw new Error('Product not found');
        }
        throw new Error('Product is inactive');
      }

      // 3. Crear el movimiento dentro de la misma transacción
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

      if (!movement) {
        throw new Error('Failed to create movement');
      }

      return this.toDomain(movement);
    });
  }

  async createExit(data: CreateMovementData): Promise<Movement> {
    return db.transaction(async (tx) => {
      // 1. UPDATE atómico con guarda de stock:
      //    resta solo si el producto existe, está activo Y el stock actual
      //    alcanza. Dos OUT concurrentes no pueden gastar más del disponible.
      const [updated] = await tx
        .update(products)
        .set({
          stock: sql`${products.stock} - ${data.quantity}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(products.id, data.productId),
          eq(products.active, true),
          gte(products.stock, data.quantity),
        ))
        .returning();

      if (!updated) {
        // 2. Diagnóstico: 404 (no existe) vs 400 (inactivo) vs 400 (sin stock)
        const [current] = await tx
          .select()
          .from(products)
          .where(eq(products.id, data.productId));

        if (!current) {
          throw new Error('Product not found');
        }
        if (!current.active) {
          throw new Error('Product is inactive');
        }
        throw new Error('Insufficient stock');
      }

      // 3. Crear el movimiento dentro de la misma transacción
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

      if (!movement) {
        throw new Error('Failed to create movement');
      }

      return this.toDomain(movement);
    });
  }

  async findByProductId(productId: string, options?: { page?: number; limit?: number }): Promise<Movement[]> {
    const { offset, limit } = this.buildPagination(options);

    const results = await db
      .select()
      .from(movements)
      .where(eq(movements.productId, productId))
      .orderBy(desc(movements.createdAt))
      .limit(limit)
      .offset(offset);

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

  private buildPagination(options?: { page?: number; limit?: number }) {
    const limit = options?.limit ?? 20;
    const page = options?.page ?? 1;
    const offset = (page - 1) * limit;
    return { offset, limit };
  }
}