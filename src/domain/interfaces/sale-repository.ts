import type { Sale, SaleSummary, SaleItem } from '../entities/sale';

// Línea que el cliente manda: solo producto y cantidad. El precio se lee del
// producto AL CONFIRMAR la venta (nunca viene del cliente).
export interface SaleItemInput {
  productId: string;
  quantity: number;
}

export interface CreateSaleData {
  userId: string;
  items: SaleItemInput[];
}

export interface SaleRepository {
  // Crea la venta CON descuento de stock en una única transacción atómica:
  // valida stock de TODAS las líneas, las descuenta, inserta venta + ítems
  // y registra un movimiento OUT por línea (con saleId para trazabilidad).
  // Si CUALQUIER línea falla, nada queda: no se vende a medias.
  createWithItems(data: CreateSaleData): Promise<Sale>;
  // Detalle con líneas (incluye nombre/SKU del producto para la UI).
  findById(id: string): Promise<Sale | null>;
  // Listado reciente (resúmenes sin líneas).
  findAll(limit?: number): Promise<SaleSummary[]>;
}

export type { Sale, SaleSummary, SaleItem };