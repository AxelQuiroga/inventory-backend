import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RegisterStockEntry } from './register-entry';
import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import { MovementType, type Movement } from '../../domain/entities/movement';

const movement: Movement = {
  id: 'mov-1',
  productId: 'prod-1',
  userId: 'user-1',
  type: MovementType.IN,
  quantity: 5,
  reason: 'Reabastecimiento',
  createdAt: new Date('2026-01-02'),
};

const movementRepository: MovementRepository = {
  createEntry: vi.fn(),
  createExit: vi.fn(),
  findByProductId: vi.fn(),
  findGlobal: vi.fn(),
};

const useCase = new RegisterStockEntry(movementRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterStockEntry', () => {
  it('registra una entrada y delega en createEntry', async () => {
    vi.mocked(movementRepository.createEntry).mockResolvedValue(movement);

    const result = await useCase.execute({
      productId: 'prod-1',
      userId: 'user-1',
      quantity: 5,
      reason: 'Reabastecimiento',
    });

    expect(movementRepository.createEntry).toHaveBeenCalledWith({
      productId: 'prod-1',
      userId: 'user-1',
      quantity: 5,
      reason: 'Reabastecimiento',
    });
    expect(result).toEqual(movement);
  });
});