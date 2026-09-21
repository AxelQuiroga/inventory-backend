// Entidades del módulo de ventas. El total SIEMPRE se deriva de las líneas
// (Σ quantity × unitPrice), nunca se almacena: una sola fuente de verdad.
export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName?: string; // nombre al momento de consultar (para el detalle)
  productSku?: string;
  quantity: number;
  unitPrice: number; // precio congelado al momento de la venta
  total: number; // derivado: quantity * unitPrice
}

export interface Sale {
  id: string;
  userId: string;
  items: SaleItem[];
  total: number; // derivado: Σ items.total
  createdAt: Date;
}

// Resumen para el listado: sin líneas, con el total derivado.
export interface SaleSummary {
  id: string;
  userId: string;
  itemCount: number;
  total: number;
  createdAt: Date;
}