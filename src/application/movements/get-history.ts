import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import type { Movement } from '../../domain/entities/movement';

export class GetMovementHistory {
  constructor(private movementRepository: MovementRepository) {}

  async execute(productId: string): Promise<Movement[]> {
    return this.movementRepository.findByProductId(productId);
  }
}