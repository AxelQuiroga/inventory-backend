import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GetMovements } from './get-movements';
import type { MovementRepository } from '../../domain/interfaces/movement-repository';
import { MovementType, type GlobalMovement } from '../../domain/entities/movement';

const movements: GlobalMovement[] = [
  {
    id: 'mov-1',
    productId: 'prod-1',
    productSku: 'MAR-1',
    productName: 'Martillo',
    userId: 'user-1',
    userName: 'Axel',
    type: MovementType.IN,
    quantity: 10,
    reason: 'Stock inicial',
    createdAt: new Date('2026-01-02'),
  },
];

const movementRepository: MovementRepository = {
  createEntry: vi.fn(),
  createExit: vi.fn(),
  findByProductId: vi.fn(),
  findGlobal: vi.fn(),
};

const useCase = new GetMovements(movementRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetMovements — política de visibilidad por rol', () => {
  it('ADMIN: pide la autoría (includeUser=true) y conserva el filtro de usuario', async () => {
    vi.mocked(movementRepository.findGlobal).mockResolvedValue({ data: movements, total: movements.length });

    const result = await useCase.execute({
      role: 'ADMIN',
      userId: 'user-1',
      type: 'IN',
      page: 1,
      limit: 20,
    });

    expect(movementRepository.findGlobal).toHaveBeenCalledWith(
      { userId: 'user-1', type: 'IN', page: 1, limit: 20 },
      { includeUser: true },
    );
    expect(result).toEqual({ data: movements, total: movements.length });
  });

  it('OPERATOR: sin autoría (includeUser=false) y DESCARTA el filtro de usuario', async () => {
    vi.mocked(movementRepository.findGlobal).mockResolvedValue({ data: movements, total: movements.length });

    // Aunque el cliente mande userId (no debería), la política lo ignora:
    // un rol que no ve autores no puede filtrar por uno.
    const result = await useCase.execute({
      role: 'OPERATOR',
      userId: 'user-1',
      type: 'OUT',
      page: 1,
      limit: 20,
    });

    expect(movementRepository.findGlobal).toHaveBeenCalledWith(
      { type: 'OUT', page: 1, limit: 20 },
      { includeUser: false },
    );
    expect(result).toEqual({ data: movements, total: movements.length });
  });

  it('VIEWER: mismo trato que OPERATOR — sin autoría y sin filtro de usuario', async () => {
    vi.mocked(movementRepository.findGlobal).mockResolvedValue({ data: [], total: 0 });

    const result = await useCase.execute({ role: 'VIEWER', page: 1, limit: 20 });

    expect(movementRepository.findGlobal).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      { includeUser: false },
    );
    expect(result).toEqual({ data: [], total: 0 });
  });
});