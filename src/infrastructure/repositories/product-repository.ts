import { eq, like, and, gte, lte, sql, asc, desc, ilike } from 'drizzle-orm';
import { db } from '../database';
import { products } from '../database/schema/products';
import type { ProductRepository, ProductFilters } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class DrizzleProductRepository implements ProductRepository {

  async create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const [created] = await db
      .insert(products)
      .values({
        name: data.name,
        description: data.description,
        sku: data.sku,
        category: data.category,
        unit: data.unit,
        price: String(data.price),
        stock: data.stock,
        minStock: data.minStock,
      })
      .returning();

    return this.toDomain(created);
  }

  async findById(id: string): Promise<Product | null> {
    const [found] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));

    return found ? this.toDomain(found) : null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const [found] = await db
      .select()
      .from(products)
      .where(eq(products.sku, sku));

    return found ? this.toDomain(found) : null;
  }

  async findAll(filters?: ProductFilters): Promise<Product[]> {
    const conditions = this.buildConditions(filters);
    const order = this.buildOrder(filters);
    const { offset, limit } = this.buildPagination(filters);

    const results = await db
      .select()
      .from(products)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...order)
      .limit(limit)
      .offset(offset);

    return results.map((r) => this.toDomain(r));
  }

  async update(
    id: string,
    data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Product | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.price !== undefined) updateData.price = String(data.price);
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.minStock !== undefined) updateData.minStock = data.minStock;

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    return updated ? this.toDomain(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [deleted] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();

    return !!deleted;
  }

  // --- Métodos privados ---

  private toDomain(row: typeof products.$inferSelect): Product {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      sku: row.sku,
      category: row.category,
      unit: row.unit,
      price: Number(row.price),
      stock: row.stock,
      minStock: row.minStock,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private buildConditions(filters?: ProductFilters) {
    const conditions = [];

    if (filters?.search) {
      conditions.push(
        ilike(products.name, `%${filters.search}%`)
      );
    }

    if (filters?.category) {
      conditions.push(eq(products.category, filters.category));
    }

    if (filters?.minPrice !== undefined) {
      conditions.push(gte(products.price, String(filters.minPrice)));
    }

    if (filters?.maxPrice !== undefined) {
      conditions.push(lte(products.price, String(filters.maxPrice)));
    }

    if (filters?.lowStock) {
      conditions.push(sql`${products.stock} <= ${products.minStock}`);
    }

    return conditions;
  }

  private buildOrder(filters?: ProductFilters) {
    const column = filters?.sortBy ?? 'createdAt';
    const direction = filters?.order === 'asc' ? asc : desc;

    const columnMap = {
      name: products.name,
      price: products.price,
      stock: products.stock,
      createdAt: products.createdAt,
    };

    return [direction(columnMap[column])];
  }

    private buildPagination(filters?: ProductFilters) {
    const limit = filters?.limit ?? 20;
    const page = filters?.page ?? 1;
    const offset = (page - 1) * limit;
    return { offset, limit };
  }
}
