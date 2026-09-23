import type { ProductRepository, ProductSummary } from '../../domain/interfaces/product-repository';

// Proyección agregada para el dashboard. Vive como use case propio porque
// responde a OTRO caso de uso (una pantalla de resumen, no un listado):
// traer los productos para sumar stock en el cliente no escala.
export class GetProductSummary {
  constructor(private repository: ProductRepository) {}

  async execute(): Promise<ProductSummary> {
    return this.repository.getSummary();
  }
}