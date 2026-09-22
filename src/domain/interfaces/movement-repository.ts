import type { Movement, GlobalMovement } from '../entities/movement';

export interface CreateMovementData {
  productId: string;
  userId: string;
  quantity: number;
  reason: string;
}

export interface MovementFilters {
  productId?: string;
  userId?: string;
  type?: 'IN' | 'OUT';
  page?: number;
  limit?: number;
}

export interface MovementRepository {
  createEntry(data: CreateMovementData): Promise<Movement>;
  createExit(data: CreateMovementData): Promise<Movement>;
  findByProductId(productId: string, options?: { page?: number; limit?: number }): Promise<Movement[]>;
  // Vista global con joins: producto siempre; autoría (userId + userName)
  // solo cuando includeUser=true — el dato de autoría no se consulta para
  // roles que no tienen permiso de verlo.
  findGlobal(filters?: MovementFilters, options?: { includeUser?: boolean }): Promise<GlobalMovement[]>;
}