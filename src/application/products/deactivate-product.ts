import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class DeactivateProduct {
  constructor(private repository: ProductRepository) {}

  async execute(id: string): Promise<Product | null> {
    // Soft delete: el producto se conserva (ID, SKU, stock, historial)
    // pero queda marcado como inactivo y rechaza movimientos de stock.
    return this.repository.setActive(id, false);
  }
}