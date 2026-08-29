import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RegisterStockExit } from './register-exit';
import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import { MovementType, type Movement } from '../../domain/entities/movement';

const movement: Movement = {
  id: 'mov-2',
  productId: 'prod-1',
  userId: 'user-1',
  type: MovementType.OUT,
  quantity: 3,
  reason: 'Venta',
  createdAt: new Date('2026-01-03'),
};

const movementRepository: MovementRepository = {
  createEntry: vi.fn(),
  createExit: vi.fn(),
  findByProductId: vi.fn(),
  findAll: vi.fn(),
};

const useCase = new RegisterStockExit(movementRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterStockExit', () => {
  it('registra una salida y delega en createExit', async () => {
    vi.mocked(movementRepository.createExit).mockResolvedValue(movement);

    const result = await useCase.execute({
      productId: 'prod-1',
      userId: 'user-1',
      quantity: 3,
      reason: 'Venta',
    });

    expect(movementRepository.createExit).toHaveBeenCalledWith({
      productId: 'prod-1',
      userId: 'user-1',
      quantity: 3,
      reason: 'Venta',
    });
    expect(result).toEqual(movement);
  });
});