import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GetMovementHistory } from './get-history';
import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import { MovementType, type Movement } from '../../domain/entities/movement';

const movements: Movement[] = [
  {
    id: 'mov-1',
    productId: 'prod-1',
    userId: 'user-1',
    type: MovementType.IN,
    quantity: 5,
    reason: 'Reabastecimiento',
    createdAt: new Date('2026-01-02'),
  },
  {
    id: 'mov-2',
    productId: 'prod-1',
    userId: 'user-1',
    type: MovementType.OUT,
    quantity: 3,
    reason: 'Venta',
    createdAt: new Date('2026-01-03'),
  },
];

const movementRepository: MovementRepository = {
  createEntry: vi.fn(),
  createExit: vi.fn(),
  findByProductId: vi.fn(),
  findAll: vi.fn(),
};

const useCase = new GetMovementHistory(movementRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetMovementHistory', () => {
  it('devuelve el historial de movimientos del producto', async () => {
    vi.mocked(movementRepository.findByProductId).mockResolvedValue(movements);

    const result = await useCase.execute('prod-1');

    expect(movementRepository.findByProductId).toHaveBeenCalledWith('prod-1', {});
    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe(MovementType.IN);
    expect(result[1]?.type).toBe(MovementType.OUT);
  });

  it('devuelve lista vacía cuando no hay movimientos', async () => {
    vi.mocked(movementRepository.findByProductId).mockResolvedValue([]);

    const result = await useCase.execute('prod-sin-movimientos');

    expect(result).toEqual([]);
  });

  it('reenvía las opciones de paginación al repositorio', async () => {
    vi.mocked(movementRepository.findByProductId).mockResolvedValue(movements);

    const result = await useCase.execute('prod-1', { page: 2, limit: 10 });

    expect(movementRepository.findByProductId).toHaveBeenCalledWith('prod-1', { page: 2, limit: 10 });
    expect(result).toHaveLength(2);
  });
});