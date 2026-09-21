import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Apunta DrizzleMovementRepository a la TEST DB (no a la de desarrollo)
vi.mock('../database', async () => {
  const { testDb } = await import('../database/test-db');
  return { db: testDb };
});

import { DrizzleMovementRepository } from './movement-repository';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../database/test-utils';
import { closeTestDb, testPool } from '../database/test-db';
import { MovementType } from '../../domain/entities/movement';

const repo = new DrizzleMovementRepository();

beforeAll(async () => {
  await verifyTestDbIsReady();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('DrizzleMovementRepository (integración real con PostgreSQL)', () => {
  it('1. entrada correcta: crea el movimiento IN y suma al stock', async () => {
    const product = await createProduct();
    const user = await createUser();

    const movement = await repo.createEntry({
      productId: product.id,
      userId: user.id,
      quantity: 5,
      reason: 'Stock inicial',
    });

    expect(movement.type).toBe(MovementType.IN);
    expect(movement.quantity).toBe(5);

    const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(rows[0].stock)).toBe(5);
  });

  it('2. salida correcta: crea el movimiento OUT y resta al stock', async () => {
    const product = await createProduct({ stock: 10 });
    const user = await createUser();

    const movement = await repo.createExit({
      productId: product.id,
      userId: user.id,
      quantity: 3,
      reason: 'Venta',
    });

    expect(movement.type).toBe(MovementType.OUT);

    const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(rows[0].stock)).toBe(7);
  });

  it('3+4. salida sin stock suficiente: rechazada, sin tocar stock ni crear movimiento', async () => {
    const product = await createProduct({ stock: 2 });
    const user = await createUser();

    await expect(
      repo.createExit({ productId: product.id, userId: user.id, quantity: 5, reason: 'Venta' }),
    ).rejects.toThrow('Insufficient stock');

    const { rows: stockRows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(stockRows[0].stock)).toBe(2);

    const { rows: movRows } = await testPool.query('SELECT COUNT(*) FROM movements WHERE product_id = $1', [product.id]);
    expect(Number(movRows[0].count)).toBe(0);
  });

  it('5. fallo al crear el movimiento revierte el stock (rollback)', async () => {
    const product = await createProduct({ stock: 0 });
    // userId inexistente: el INSERT del movimiento viola la FK y aborta la
    // transacción → el UPDATE de stock debe revertirse.
    const ghostUser = randomUUID();

    await expect(
      repo.createEntry({ productId: product.id, userId: ghostUser, quantity: 10, reason: 'X' }),
    ).rejects.toThrow();

    const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(rows[0].stock)).toBe(0);
  });

  it('6. producto inactivo rechaza entrada', async () => {
    const product = await createProduct({ active: false });
    const user = await createUser();

    await expect(
      repo.createEntry({ productId: product.id, userId: user.id, quantity: 5, reason: 'X' }),
    ).rejects.toThrow('Product is inactive');
  });

  it('7. producto inactivo rechaza salida', async () => {
    const product = await createProduct({ active: false, stock: 10 });
    const user = await createUser();

    await expect(
      repo.createExit({ productId: product.id, userId: user.id, quantity: 5, reason: 'X' }),
    ).rejects.toThrow('Product is inactive');
  });

  it('8. persiste el userId que registró el movimiento', async () => {
    const product = await createProduct();
    const user = await createUser();

    const movement = await repo.createEntry({
      productId: product.id,
      userId: user.id,
      quantity: 1,
      reason: 'X',
    });

    expect(movement.userId).toBe(user.id);
  });

  it('9. dos salidas concurrentes no consumen más que el stock disponible', async () => {
    const product = await createProduct({ stock: 10 });
    const user = await createUser();

    // Ambas salidas piden 6: solo una puede pasar. La guarda se evalúa en la
    // DB (stock >= cantidad), no en JS.
    const results = await Promise.allSettled([
      repo.createExit({ productId: product.id, userId: user.id, quantity: 6, reason: 'A' }),
      repo.createExit({ productId: product.id, userId: user.id, quantity: 6, reason: 'B' }),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const { rows: stockRows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(stockRows[0].stock)).toBe(4);

    const { rows: movRows } = await testPool.query('SELECT COUNT(*) FROM movements WHERE product_id = $1', [product.id]);
    expect(Number(movRows[0].count)).toBe(1);
  });

  it('10. dos entradas concurrentes no pierden unidades', async () => {
    const product = await createProduct({ stock: 0 });
    const user = await createUser();

    const results = await Promise.allSettled([
      repo.createEntry({ productId: product.id, userId: user.id, quantity: 5, reason: 'A' }),
      repo.createEntry({ productId: product.id, userId: user.id, quantity: 5, reason: 'B' }),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const { rows: stockRows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [product.id]);
    expect(Number(stockRows[0].stock)).toBe(10);

    const { rows: movRows } = await testPool.query('SELECT COUNT(*) FROM movements WHERE product_id = $1', [product.id]);
    expect(Number(movRows[0].count)).toBe(2);
  });

  it('CHECK constraint: la DB rechaza un type que no sea IN/OUT', async () => {
    const product = await createProduct();
    const user = await createUser();

    await expect(
      testPool.query(
        `INSERT INTO movements (product_id, user_id, type, quantity, reason)
         VALUES ($1, $2, 'XL', 1, 'X')`,
        [product.id, user.id],
      ),
    ).rejects.toThrow(/check/i);
  });

  it('CHECK constraint: la DB rechaza quantity <= 0', async () => {
    const product = await createProduct();
    const user = await createUser();

    await expect(
      testPool.query(
        `INSERT INTO movements (product_id, user_id, type, quantity, reason)
         VALUES ($1, $2, 'IN', 0, 'X')`,
        [product.id, user.id],
      ),
    ).rejects.toThrow(/check/i);

    await expect(
      testPool.query(
        `INSERT INTO movements (product_id, user_id, type, quantity, reason)
         VALUES ($1, $2, 'OUT', -3, 'X')`,
        [product.id, user.id],
      ),
    ).rejects.toThrow(/check/i);
  });

  it('15. movimientos inmutables: los datos creados no se alteran con operaciones posteriores', async () => {
    const product = await createProduct({ stock: 5 });
    const user = await createUser();

    const entry = await repo.createEntry({ productId: product.id, userId: user.id, quantity: 5, reason: 'Stock inicial' });

    // Operaciones posteriores
    await repo.createEntry({ productId: product.id, userId: user.id, quantity: 2, reason: 'Reposición' });
    await repo.createExit({ productId: product.id, userId: user.id, quantity: 3, reason: 'Venta' });

    const history = await repo.findByProductId(product.id);
    const original = history.find((m) => m.id === entry.id);

    expect(original).toBeDefined();
    expect(original!.quantity).toBe(5);
    expect(original!.type).toBe(MovementType.IN);
    expect(original!.reason).toBe('Stock inicial');
  });

  it('16. findByProductId pagina con limit/page (más reciente primero)', async () => {
    const product = await createProduct();
    const user = await createUser();

    for (let i = 1; i <= 5; i++) {
      await repo.createEntry({ productId: product.id, userId: user.id, quantity: i, reason: `Mov ${i}` });
    }

    // Sin opciones devuelve todo, más reciente primero
    const all = await repo.findByProductId(product.id);
    expect(all).toHaveLength(5);
    expect(all[0]!.reason).toBe('Mov 5');

    // Página 2 con limit 2 => [Mov 3, Mov 2]
    const page2 = await repo.findByProductId(product.id, { page: 2, limit: 2 });
    expect(page2).toHaveLength(2);
    expect(page2[0]!.reason).toBe('Mov 3');
    expect(page2[1]!.reason).toBe('Mov 2');

    // Página 1 con limit 2 => [Mov 5, Mov 4]
    const firstPage = await repo.findByProductId(product.id, { page: 1, limit: 2 });
    expect(firstPage.map((m) => m.reason)).toEqual(['Mov 5', 'Mov 4']);
  });
});