import type { SaleRepository } from '../../domain/interfaces/sale-repository';
import type { SaleSummary } from '../../domain/entities/sale';

export class ListSales {
  constructor(private repository: SaleRepository) {}

  async execute(limit?: number): Promise<SaleSummary[]> {
    return this.repository.findAll(limit ?? 20);
  }
}