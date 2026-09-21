import type { SaleRepository } from '../../domain/interfaces/sale-repository';
import type { Sale } from '../../domain/entities/sale';

export class GetSale {
  constructor(private repository: SaleRepository) {}

  async execute(id: string): Promise<Sale | null> {
    return this.repository.findById(id);
  }
}