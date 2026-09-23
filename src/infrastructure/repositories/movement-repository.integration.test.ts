import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Apunta DrizzleMovementRepository a la TEST DB (no a la de desarrollo)
vi.mock('../database', async () => {
  const { testDb } = await import('../database/test-db');
  return { db: testDb };
});

import { DrizzleMovementRepository } from './movement-repository';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../database/test-utils';
import { closeTestDb, testPool, testDb } from '../database/test-db';
import { users, UserRole } from '../database/schema/users';
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
    const original = history.data.find((m) => m.id === entry.id);

    expect(original).toBeDefined();
    expect(original!.quantity).toBe(5);
    expect(original!.type).toBe(MovementType.IN);
    expect(original!.reason).toBe('Stock inicial');
    expect(history.total).toBe(3);
  });

  it('16. findByProductId pagina con limit/page (más reciente primero)', async () => {
    const product = await createProduct();
    const user = await createUser();

    for (let i = 1; i <= 5; i++) {
      await repo.createEntry({ productId: product.id, userId: user.id, quantity: i, reason: `Mov ${i}` });
    }

    // Sin opciones devuelve todo, más reciente primero
    const all = await repo.findByProductId(product.id);
    expect(all.data).toHaveLength(5);
    expect(all.total).toBe(5);
    expect(all.data[0]!.reason).toBe('Mov 5');

    // Página 2 con limit 2 => [Mov 3, Mov 2]
    const page2 = await repo.findByProductId(product.id, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(2);
    expect(page2.data[0]!.reason).toBe('Mov 3');
    expect(page2.data[1]!.reason).toBe('Mov 2');

    // Página 1 con limit 2 => [Mov 5, Mov 4]; el total NO se recorta con la página
    const firstPage = await repo.findByProductId(product.id, { page: 1, limit: 2 });
    expect(firstPage.data.map((m) => m.reason)).toEqual(['Mov 5', 'Mov 4']);
    expect(firstPage.total).toBe(5);
  });
});

describe('DrizzleMovementRepository.findGlobal (vista global con joins)', () => {
  // Fixtures con nombres DISTINTOS para probar el join a users y products.
  async function seedGlobalData() {
    const product = await createProduct({ name: 'Martillo', sku: 'MAR-1' });
    const user = await testDb
      .insert(users)
      .values({
        email: `global-${randomUUID()}@test.local`,
        password: 'not-used-in-tests',
        name: 'Axel Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    if (!user[0]) throw new Error('Failed to create global test user');

    const entry = await repo.createEntry({
      productId: product.id,
      userId: user[0].id,
      quantity: 10,
      reason: 'Stock inicial',
    });
    const exit = await repo.createExit({
      productId: product.id,
      userId: user[0].id,
      quantity: 4,
      reason: 'Venta',
    });

    return { product, user: user[0], entry, exit };
  }

  it('join a products: expone sku y nombre del producto sin autoría (includeUser=false)', async () => {
    const { product } = await seedGlobalData();

    const all = await repo.findGlobal({}, { includeUser: false });

    expect(all.data).toHaveLength(2);
    expect(all.total).toBe(2);
    const first = all.data[0]!;
    expect(first.productId).toBe(product.id);
    expect(first.productSku).toBe('MAR-1');
    expect(first.productName).toBe('Martillo');
    // Redacción estructural: el dato de autoría NO viaja sin permiso.
    expect(first.userId).toBeNull();
    expect(first.userName).toBeNull();
  });

  it('includeUser=true: une users y expone userId + userName reales', async () => {
    const { user } = await seedGlobalData();

    const all = await repo.findGlobal({}, { includeUser: true });

    expect(all.data).toHaveLength(2);
    expect(all.total).toBe(2);
    for (const m of all.data) {
      expect(m.userId).toBe(user.id);
      expect(m.userName).toBe('Axel Admin');
    }
  });

  it('filtra por type (IN/OUT)', async () => {
    const { entry, exit } = await seedGlobalData();

    const ins = await repo.findGlobal({ type: 'IN' }, { includeUser: false });
    expect(ins.data.map((m) => m.id)).toEqual([entry.id]);
    expect(ins.total).toBe(1);

    const outs = await repo.findGlobal({ type: 'OUT' }, { includeUser: false });
    expect(outs.data.map((m) => m.id)).toEqual([exit.id]);
    expect(outs.total).toBe(1);
  });

  it('filtra por productId', async () => {
    const { product, entry, exit } = await seedGlobalData();
    // Un segundo producto con su propio movimiento: si el filtro no aplicara,
    // este movimiento contaminaría el resultado.
    const otherProduct = await createProduct({ name: 'Taladro', sku: 'TAL-1' });
    await repo.createEntry({
      productId: otherProduct.id,
      userId: entry.userId,
      quantity: 1,
      reason: 'Ajeno',
    });

    const filtered = await repo.findGlobal({ productId: product.id }, { includeUser: false });
    expect(filtered.data.map((m) => m.id)).toEqual(expect.arrayContaining([entry.id, exit.id]));
    expect(filtered.data).toHaveLength(2);
    expect(filtered.total).toBe(2);
  });

  it('filtra por userId SOLO con includeUser; sin autoría lo ignora', async () => {
    const { user, entry, exit } = await seedGlobalData();
    // Otro usuario con sus propios movimientos: debe quedar fuera del filtro.
    const otherUser = await createUser();
    await repo.createEntry({
      productId: entry.productId,
      userId: otherUser.id,
      quantity: 1,
      reason: 'De otro',
    });

    const filtered = await repo.findGlobal({ userId: user.id }, { includeUser: true });
    expect(filtered.data.map((m) => m.id)).toEqual(expect.arrayContaining([entry.id, exit.id]));
    expect(filtered.data).toHaveLength(2);
    expect(filtered.total).toBe(2);

    // Sin permiso de autoría, un userId en los filtros NO condiciona la query:
    // devuelve todo (no filtra por un autor invisible).
    const guarded = await repo.findGlobal({ userId: user.id }, { includeUser: false });
    expect(guarded.data).toHaveLength(3);
    expect(guarded.total).toBe(3);
    expect(guarded.data.map((m) => m.id)).toEqual(expect.arrayContaining([entry.id, exit.id]));
  });

  it('pagina con limit/page y ordena más reciente primero', async () => {
    const { product, user } = await seedGlobalData();
    for (let i = 1; i <= 3; i++) {
      await repo.createEntry({ productId: product.id, userId: user.id, quantity: i, reason: `Extra ${i}` });
    }

    const page2 = await repo.findGlobal({ limit: 2, page: 2 }, { includeUser: false });
    expect(page2.data).toHaveLength(2);
    expect(page2.total).toBe(5);
    // 5 movs ordenados desc: Extra 3, Extra 2, Extra 1, exit, entry → página 2 = [Extra 1, exit]
    expect(page2.data[0]!.reason).toBe('Extra 1');
    expect(page2.data[1]!.reason).toBe('Venta');
  });
});