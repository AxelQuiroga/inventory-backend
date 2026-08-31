import type { ProductRepository, ProductCreateData } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class UpdateProduct {
  constructor(private repository: ProductRepository) {}

  async execute(
    id: string,
    data: Partial<ProductCreateData>
  ): Promise<Product | null> {
    if (data.sku) {
      const existing = await this.repository.findBySku(data.sku);
      if (existing && existing.id !== id) {
        throw new Error('SKU already exists');
      }
    }

    return this.repository.update(id, data);
  }
}