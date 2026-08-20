import type { ProductRepository } from '../../domain/interfaces/product-repository';
import type { Product } from '../../domain/entities/product';

export class CreateProduct {
  constructor(private repository: ProductRepository) {}

  async execute(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const existing = await this.repository.findBySku(data.sku);
    if (existing) {
      throw new Error('SKU already exists');
    }

    return this.repository.create(data);
  }
}