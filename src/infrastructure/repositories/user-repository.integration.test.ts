import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Apunta DrizzleUserRepository a la TEST DB (no a la de desarrollo)
vi.mock('../database', async () => {
  const { testDb } = await import('../database/test-db');
  return { db: testDb };
});

import { DrizzleUserRepository } from './user-repository';
import { verifyTestDbIsReady, resetTestDb } from '../database/test-utils';
import { closeTestDb } from '../database/test-db';
import { UserRole } from '../../domain/entities/user';

const repo = new DrizzleUserRepository();

beforeAll(async () => {
  await verifyTestDbIsReady();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('DrizzleUserRepository (integración real con PostgreSQL)', () => {
  it('1. create persiste la cuenta activa por defecto', async () => {
    const user = await repo.create({
      email: 'nuevo@inventory.com',
      password: 'hash-inexistente',
      name: 'Nuevo',
      role: UserRole.OPERATOR,
      active: true,
    });

    expect(user.id).toBeTypeOf('string');
    expect(user.active).toBe(true);
    expect(user.role).toBe(UserRole.OPERATOR);
  });

  it('2. updateActive(false) desactiva la cuenta y el cambio persiste', async () => {
    const user = await repo.create({
      email: 'nuevo@inventory.com',
      password: 'hash-inexistente',
      name: 'Nuevo',
      role: UserRole.VIEWER,
      active: true,
    });

    const updated = await repo.updateActive(user.id, false);
    expect(updated?.active).toBe(false);

    const found = await repo.findByEmail('nuevo@inventory.com');
    expect(found?.active).toBe(false);
  });

  it('3. updateActive(true) reactiva la cuenta', async () => {
    const user = await repo.create({
      email: 'nuevo@inventory.com',
      password: 'hash-inexistente',
      name: 'Nuevo',
      role: UserRole.VIEWER,
      active: false,
    });

    const updated = await repo.updateActive(user.id, true);
    expect(updated?.active).toBe(true);

    const found = await repo.findByEmail('nuevo@inventory.com');
    expect(found?.active).toBe(true);
  });

  it('4. updateActive de un id inexistente devuelve null', async () => {
    const updated = await repo.updateActive('00000000-0000-4000-8000-000000000000', false);
    expect(updated).toBeNull();
  });
});