import type { ProductRepository } from '../../domain/interfaces/product-repository';

export class DeleteProduct {
  constructor(private repository: ProductRepository) {}

  async execute(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}