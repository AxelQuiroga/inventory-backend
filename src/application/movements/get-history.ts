import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import type { Movement } from '../../domain/entities/movement';

export class GetMovementHistory {
  constructor(private movementRepository: MovementRepository) {}

  async execute(productId: string, options: { page?: number; limit?: number } = {}): Promise<Movement[]> {
    return this.movementRepository.findByProductId(productId, options);
  }
}