import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db } from '../database';
import { movements } from '../database/schema/movements';
import { products } from '../database/schema/products';
import { users } from '../database/schema/users';
import type { MovementRepository, CreateMovementData, MovementFilters } from '../../domain/interfaces/movement-repository';
import type { Movement, GlobalMovement } from '../../domain/entities/movement';
import type { Paginated } from '../../domain/interfaces/pagination';

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

  async findByProductId(productId: string, options?: { page?: number; limit?: number }): Promise<Paginated<Movement>> {
    const { offset, limit } = this.buildPagination(options);

    const results = await db
      .select()
      .from(movements)
      .where(eq(movements.productId, productId))
      .orderBy(desc(movements.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(movements)
      .where(eq(movements.productId, productId));

    return {
      data: results.map((r) => this.toDomain(r)),
      total: totalRow?.count ?? 0,
    };
  }

  async findGlobal(filters: MovementFilters = {}, options: { includeUser?: boolean } = {}): Promise<Paginated<GlobalMovement>> {
    const { offset, limit } = this.buildPagination(filters);

    // Filtros del contrato: type/productId para todos; userId SOLO cuando la
    // consulta pide la autoría (un rol que no ve autores no filtra por uno).
    const conditions = [];
    if (filters.type) conditions.push(eq(movements.type, filters.type));
    if (filters.productId) conditions.push(eq(movements.productId, filters.productId));
    if (options.includeUser && filters.userId) conditions.push(eq(movements.userId, filters.userId));
    // and() con lista vacía devuelve undefined (sin WHERE): válido en drizzle.
    const where = and(...conditions);

    // El count replica los MISMOS joins y filtros que la query de datos:
    // si filtra por autor, el count debe contar solo los de ese autor.
    const [totalRow] = options.includeUser
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(movements)
          .innerJoin(products, eq(movements.productId, products.id))
          .innerJoin(users, eq(movements.userId, users.id))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)::int` })
          .from(movements)
          .innerJoin(products, eq(movements.productId, products.id))
          .where(where);
    const total = totalRow?.count ?? 0;

    // El join a users es CONDICIONAL a includeUser: para OPERATOR/VIEWER la
    // query ni siquiera toca la tabla users — el dato no se lee del motor.
    if (options.includeUser) {
      const results = await db
        .select({
          id: movements.id,
          productId: movements.productId,
          productSku: products.sku,
          productName: products.name,
          type: movements.type,
          quantity: movements.quantity,
          reason: movements.reason,
          createdAt: movements.createdAt,
          userId: movements.userId,
          userName: users.name,
        })
        .from(movements)
        .innerJoin(products, eq(movements.productId, products.id))
        .innerJoin(users, eq(movements.userId, users.id))
        .where(where)
        .orderBy(desc(movements.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        data: results.map((r) => ({
          id: r.id,
          productId: r.productId,
          productSku: r.productSku,
          productName: r.productName,
          userId: r.userId,
          userName: r.userName,
          type: r.type as Movement['type'],
          quantity: r.quantity,
          reason: r.reason,
          createdAt: r.createdAt,
        })),
        total,
      };
    }

    // Sin autoría: NULL literal en los campos de autor (redacción estructural:
    // el dato no viaja ni como columna proyectada).
    const results = await db
      .select({
        id: movements.id,
        productId: movements.productId,
        productSku: products.sku,
        productName: products.name,
        type: movements.type,
        quantity: movements.quantity,
        reason: movements.reason,
        createdAt: movements.createdAt,
        userId: sql<null>`NULL`,
        userName: sql<null>`NULL`,
      })
      .from(movements)
      .innerJoin(products, eq(movements.productId, products.id))
      .where(where)
      .orderBy(desc(movements.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: results.map((r) => ({
        id: r.id,
        productId: r.productId,
        productSku: r.productSku,
        productName: r.productName,
        userId: r.userId,
        userName: r.userName,
        type: r.type as Movement['type'],
        quantity: r.quantity,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
      total,
    };
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