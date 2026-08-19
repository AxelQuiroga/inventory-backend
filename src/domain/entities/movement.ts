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