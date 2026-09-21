import type { SaleRepository, CreateSaleData } from '../../domain/interfaces/sale-repository';
import type { Sale } from '../../domain/entities/sale';

// La validación fuerte vive en la transacción del repositorio (stock,
// producto activo, existencia): acá solo se delega, igual que el resto de
// los use cases del proyecto. El formato (uuid, cantidad > 0, items ≥ 1)
// lo garantiza el schema zod de la presentación.
export class CreateSale {
  constructor(private repository: SaleRepository) {}

  async execute(data: CreateSaleData): Promise<Sale> {
    return this.repository.createWithItems(data);
  }
}