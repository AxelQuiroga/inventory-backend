import type { Movement } from '../entities/movement';

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
  findAll(filters?: MovementFilters): Promise<Movement[]>;
}