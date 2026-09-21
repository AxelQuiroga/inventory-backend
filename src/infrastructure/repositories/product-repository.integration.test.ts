import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Apunta DrizzleProductRepository a la TEST DB (no a la de desarrollo)
vi.mock('../database', async () => {
  const { testDb } = await import('../database/test-db');
  return { db: testDb };
});

import { DrizzleProductRepository } from './product-repository';
import { DrizzleMovementRepository } from './movement-repository';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../database/test-utils';
import { closeTestDb, testPool } from '../database/test-db';

const repo = new DrizzleProductRepository();
const movementRepo = new DrizzleMovementRepository();

beforeAll(async () => {
  await verifyTestDbIsReady();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('DrizzleProductRepository (integración real con PostgreSQL)', () => {
  it('11. crear producto: stock 0 y activo por defecto (el stock no entra por creación)', async () => {
    const product = await repo.create({
      name: 'Laptop',
      description: 'Laptop 14"',
      sku: 'LAP-INT-001',
      category: 'Electrónica',
      unit: 'unit',
      price: 899.99,
      minStock: 5,
    });

    expect(product.stock).toBe(0);
    expect(product.active).toBe(true);
  });

  it('12. el stock inicial entra vía un movimiento IN', async () => {
    const product = await repo.create({
      name: 'Mesa',
      description: '',
      sku: 'MESA-001',
      category: 'Muebles',
      unit: 'unit',
      price: 100,
      minStock: 5,
    });
    const user = await createUser();

    const movement = await movementRepo.createEntry({
      productId: product.id,
      userId: user.id,
      quantity: 20,
      reason: 'Stock inicial',
    });

    expect(movement).toBeDefined();

    const refreshed = await repo.findById(product.id);
    expect(refreshed?.stock).toBe(20);

    const history = await movementRepo.findByProductId(product.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.reason).toBe('Stock inicial');
  });

  it('12b. createWithInitialStock: crea producto con stock + movimiento IN en una transacción', async () => {
    const user = await createUser();

    const created = await repo.createWithInitialStock({
      product: {
        name: 'Tornillo',
        description: '',
        sku: 'TORN-001',
        category: 'Ferretería',
        unit: 'unit',
        price: 1.5,
        minStock: 100,
      },
      initialStock: 250,
      userId: user.id,
    });

    // El producto nace CON su stock (y por debajo del mínimo: stock bajo real)
    expect(created.stock).toBe(250);
    expect(created.active).toBe(true);

    // El movimiento quedó registrado con su usuario (trazabilidad)
    const history = await movementRepo.findByProductId(created.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.type).toBe('IN');
    expect(history[0]?.quantity).toBe(250);
    expect(history[0]?.reason).toBe('Stock inicial');
    expect(history[0]?.userId).toBe(user.id);
  });

  it('12c. createWithInitialStock con userId inexistente: revierte TODO (no queda producto ni movimiento)', async () => {
    const sku = 'TORN-FK-001';

    await expect(
      repo.createWithInitialStock({
        product: {
          name: 'Tornillo fantasma',
          description: '',
          sku,
          category: 'Ferretería',
          unit: 'unit',
          price: 1.5,
          minStock: 5,
        },
        initialStock: 10,
        userId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow();

    // Atomicidad: la inserción del producto se revirtió con la transacción
    const orphan = await repo.findBySku(sku);
    expect(orphan).toBeNull();
  });

  it('13. desactivar (soft delete): conserva stock, historial y SKU; deja de aparecer en listados', async () => {
    const product = await repo.create({
      name: 'Silla',
      description: '',
      sku: 'SILLA-001',
      category: 'Muebles',
      unit: 'unit',
      price: 50,
      minStock: 5,
    });
    const user = await createUser();
    await movementRepo.createEntry({ productId: product.id, userId: user.id, quantity: 10, reason: 'Stock inicial' });

    const deactivated = await repo.setActive(product.id, false);
    expect(deactivated?.active).toBe(false);
    expect(deactivated?.stock).toBe(10); // el stock NO se toca al desactivar

    // Historial intacto
    const history = await movementRepo.findByProductId(product.id);
    expect(history).toHaveLength(1);

    // El listado por defecto lo excluye
    const list = await repo.findAll();
    expect(list.find((p) => p.id === product.id)).toBeUndefined();

    // includeInactive (ADMIN) lo incluye
    const adminList = await repo.findAll({ includeInactive: true });
    expect(adminList.find((p) => p.id === product.id)).toBeDefined();

    // findBySku conserva el SKU del inactivo (para validar unicidad)
    const bySku = await repo.findBySku('SILLA-001');
    expect(bySku?.active).toBe(false);
  });

  it('14. reactivar: vuelve al listado activo y acepta movimientos de nuevo', async () => {
    const product = await repo.create({
      name: 'Silla',
      description: '',
      sku: 'SILLA-002',
      category: 'Muebles',
      unit: 'unit',
      price: 50,
      minStock: 5,
    });
    const user = await createUser();

    await repo.setActive(product.id, false);

    // Inactivo: rechaza movimientos
    await expect(
      movementRepo.createEntry({ productId: product.id, userId: user.id, quantity: 5, reason: 'X' }),
    ).rejects.toThrow('Product is inactive');

    const reactivated = await repo.setActive(product.id, true);
    expect(reactivated?.active).toBe(true);

    // Activo: acepta movimientos de nuevo
    const movement = await movementRepo.createEntry({
      productId: product.id,
      userId: user.id,
      quantity: 5,
      reason: 'Stock inicial',
    });
    expect(movement).toBeDefined();

    const refreshed = await repo.findById(product.id);
    expect(refreshed?.active).toBe(true);
    expect(refreshed?.stock).toBe(5);

    // Aparece en el listado por defecto
    const list = await repo.findAll();
    expect(list.find((p) => p.id === product.id)).toBeDefined();
  });

  it('GET by id: devuelve el inactivo con active=false (no 404)', async () => {
    const product = await repo.create({
      name: 'Silla',
      description: '',
      sku: 'SILLA-003',
      category: 'Muebles',
      unit: 'unit',
      price: 50,
      minStock: 5,
    });
    await repo.setActive(product.id, false);

    const found = await repo.findById(product.id);
    expect(found).not.toBeNull();
    expect(found?.active).toBe(false);
  });

  it('update no puede tocar stock ni active (se mantienen invariantes)', async () => {
    const product = await repo.create({
      name: 'Silla',
      description: '',
      sku: 'SILLA-004',
      category: 'Muebles',
      unit: 'unit',
      price: 50,
      minStock: 5,
    });
    const user = await createUser();
    await movementRepo.createEntry({ productId: product.id, userId: user.id, quantity: 7, reason: 'Stock inicial' });

    // ts no deja pasar stock/active a update (el tipo está en ProductCreateData)
    const updated = await repo.update(product.id, { name: 'Escritorio' });

    expect(updated?.name).toBe('Escritorio');
    expect(updated?.stock).toBe(7);
    expect(updated?.active).toBe(true);
  });

  it('setActive sobre id inexistente devuelve null', async () => {
    const result = await repo.setActive('00000000-0000-0000-0000-000000000000', false);
    expect(result).toBeNull();
  });

  it('findAll con filtros respeta includeInactive', async () => {
    const active = await repo.create({
      name: 'A',
      description: '',
      sku: 'A-001',
      category: 'Cat',
      unit: 'unit',
      price: 1,
      minStock: 5,
    });
    const inactive = await repo.create({
      name: 'B',
      description: '',
      sku: 'B-001',
      category: 'Cat',
      unit: 'unit',
      price: 1,
      minStock: 5,
    });
    await repo.setActive(inactive.id, false);

    const defaultList = await repo.findAll({ category: 'Cat' });
    const onlyActive = defaultList.map((p) => p.id);
    expect(onlyActive).toContain(active.id);
    expect(onlyActive).not.toContain(inactive.id);

    const withInactive = await repo.findAll({ category: 'Cat', includeInactive: true });
    const allIds = withInactive.map((p) => p.id);
    expect(allIds).toContain(active.id);
    expect(allIds).toContain(inactive.id);
  });

  it('sanity: conecta a la base de TEST, nunca a la de desarrollo', async () => {
    const { rows } = await testPool.query('SELECT current_database()');
    expect(rows[0].current_database).toBe('inventory_system_test');
  });

  it('sanity: la test DB está vacía tras resetTestDb', async () => {
    const { rows } = await testPool.query('SELECT COUNT(*) FROM products');
    expect(Number(rows[0].count)).toBe(0);
  });

  it('CHECK constraint: la DB rechaza stock negativo', async () => {
    const product = await repo.create({
      name: 'Negativo',
      description: '',
      sku: 'NEG-001',
      category: 'Muebles',
      unit: 'unit',
      price: 50,
      minStock: 5,
    });

    await expect(
      testPool.query('UPDATE products SET stock = -1 WHERE id = $1', [product.id]),
    ).rejects.toThrow(/check/i);

    await expect(
      testPool.query(
        `INSERT INTO products (name, sku, category, unit, price, stock)
         VALUES ('X', 'NEG-002', 'C', 'unit', '10.00', -5)`,
      ),
    ).rejects.toThrow(/check/i);
  });
});