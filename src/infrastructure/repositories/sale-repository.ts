import { eq, and, gte, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../database';
import { expectOne } from '../database/rows';
import { sales, saleItems } from '../database/schema/sales';
import { movements } from '../database/schema/movements';
import { products } from '../database/schema/products';
import type { SaleRepository, CreateSaleData } from '../../domain/interfaces/sale-repository';
import type { Sale, SaleItem, SaleSummary } from '../../domain/entities/sale';

// Transacción única para toda la venta: si CUALQUIER línea no puede
// despacharse (producto inexistente, inactivo o sin stock), se revierte TODO
// (rollback) — ni un movimiento, ni un ítem, ni un descuento parcial.
export class DrizzleSaleRepository implements SaleRepository {
  async createWithItems(data: CreateSaleData): Promise<Sale> {
    return db.transaction(async (tx) => {
      // 1. Cabeza de la venta (sin total: es derivado). INSERT ... RETURNING
      //    en Postgres siempre devuelve la fila insertada: expectOne restaura
      //    esa cardinalidad que Drizzle tipa como T[].
      const sale = expectOne(
        await tx.insert(sales).values({ userId: data.userId }).returning(),
        'sale',
      );

      const items: SaleItem[] = [];
      for (const line of data.items) {
        // 2. Descuento atómico por línea: solo si el producto existe, está
        //    activo Y el stock alcanza. La guarda stock >= quantity cubre
        //    hasta dos terminales vendiendo el mismo stock a la vez.
        const [updated] = await tx
          .update(products)
          .set({
            stock: sql`${products.stock} - ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(products.id, line.productId),
            eq(products.active, true),
            gte(products.stock, line.quantity),
          ))
          .returning({ id: products.id, price: products.price });

        if (!updated) {
          // 3. Diagnóstico: 404 (no existe) vs 400 (inactivo) vs 400 (sin stock)
          const [current] = await tx
            .select()
            .from(products)
            .where(eq(products.id, line.productId));

          if (!current) {
            throw new Error('Product not found');
          }
          if (!current.active) {
            throw new Error('Product is inactive');
          }
          throw new Error('Insufficient stock');
        }

        // 4. Precio ACTUAL del producto: se congela en la línea. Si mañana
        //    el producto sube, las ventas históricas no cambian. El precio
        //    sale del MISMO UPDATE atómico (la fila ya está bajo row lock):
        //    una sola query por línea, sin round-trip redundante.
        const unitPrice = Number(updated.price);

        // 5. Ítem de la venta
        const item = expectOne(
          await tx
            .insert(saleItems)
            .values({
              saleId: sale.id,
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: String(unitPrice),
            })
            .returning(),
          'sale item',
        );

        // 6. Movimiento OUT con trazabilidad de la venta (historial del
        //    producto muestra la salida; saleId conecta con la venta)
        await tx.insert(movements).values({
          productId: line.productId,
          userId: data.userId,
          type: 'OUT',
          quantity: line.quantity,
          reason: 'Venta',
          saleId: sale.id,
        });

        items.push({
          id: item.id,
          saleId: sale.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice,
          total: unitPrice * line.quantity,
        });
      }

      const total = items.reduce((sum, item) => sum + item.total, 0);
      return {
        id: sale.id,
        userId: sale.userId,
        items,
        total,
        createdAt: sale.createdAt,
      };
    });
  }

  async findById(id: string): Promise<Sale | null> {
    const [sale] = await db.select().from(sales).where(eq(sales.id, id));
    if (!sale) {
      return null;
    }

    const rows = await db
      .select({
        id: saleItems.id,
        productId: saleItems.productId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        productName: products.name,
        productSku: products.sku,
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, id));

    const items: SaleItem[] = rows.map((r) => ({
      id: r.id,
      saleId: id,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      quantity: r.quantity,
      unitPrice: Number(r.unitPrice),
      total: Number(r.unitPrice) * r.quantity,
    }));

    return {
      id: sale.id,
      userId: sale.userId,
      items,
      total: items.reduce((sum, item) => sum + item.total, 0),
      createdAt: sale.createdAt,
    };
  }

  async findAll(limit = 20): Promise<SaleSummary[]> {
    const rows = await db
      .select()
      .from(sales)
      .orderBy(desc(sales.createdAt))
      .limit(limit);

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    const items = await db
      .select({
        saleId: saleItems.saleId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
      })
      .from(saleItems)
      .where(inArray(saleItems.saleId, ids));

    const bySale = new Map<string, { count: number; total: number }>();
    for (const item of items) {
      const agg = bySale.get(item.saleId) ?? { count: 0, total: 0 };
      agg.count += 1;
      agg.total += Number(item.unitPrice) * item.quantity;
      bySale.set(item.saleId, agg);
    }

    return rows.map((r) => {
      const agg = bySale.get(r.id) ?? { count: 0, total: 0 };
      return {
        id: r.id,
        userId: r.userId,
        itemCount: agg.count,
        total: agg.total,
        createdAt: r.createdAt,
      };
    });
  }
}