export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
}

export interface Movement {
  id: string;
  productId: string;
  userId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  createdAt: Date;
}

// Read model de la vista global de movimientos (GET /movements): une el
// movimiento con el producto (sku + nombre) y, solo cuando el rol lo permite
// (ADMIN), con el autor. Para el resto de roles la autoría viaja como null:
// el backend redacta el dato antes de que salga de la API.
export interface GlobalMovement {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  userId: string | null;
  userName: string | null;
  type: MovementType;
  quantity: number;
  reason: string;
  createdAt: Date;
}