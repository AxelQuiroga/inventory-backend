import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import type { Movement } from '../../domain/entities/movement';

export class RegisterStockEntry {
  constructor(private movementRepository: MovementRepository) {}

  async execute(data: {
    productId: string;
    userId: string;
    quantity: number;
    reason: string;
  }): Promise<Movement> {
    return this.movementRepository.createEntry(data);
  }
}