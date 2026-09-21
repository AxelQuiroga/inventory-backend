import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Apunta DrizzleSaleRepository a la TEST DB (no a la de desarrollo)
vi.mock('../database', async () => {
  const { testDb } = await import('../database/test-db');
  return { db: testDb };
});

import { DrizzleSaleRepository } from './sale-repository';
import { verifyTestDbIsReady, resetTestDb, createUser, createProduct } from '../database/test-utils';
import { closeTestDb, testPool } from '../database/test-db';

const repo = new DrizzleSaleRepository();

beforeAll(async () => {
  await verifyTestDbIsReady();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

async function expectStock(productId: string, expected: number) {
  const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [productId]);
  expect(Number(rows[0].stock)).toBe(expected);
}

// Assertion function de TypeScript: el assert corre en runtime Y estrecha el
// tipo en compile-time. Con noUncheckedIndexedAccess, findById devuelve
// Sale | null; esto permite acceder después sin `!` ni supresiones.
function expectSome<T>(value: T | null | undefined): asserts value is T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
}

describe('DrizzleSaleRepository (integración real con PostgreSQL)', () => {
  it('1. venta multi-línea: descuenta stock, congela el precio actual y deja movimientos OUT', async () => {
    const user = await createUser();
    const a = await createProduct({ stock: 20, price: '100.00' });
    const b = await createProduct({ stock: 10, price: '50.50' });

    const sale = await repo.createWithItems({
      userId: user.id,
      items: [
        { productId: a.id, quantity: 5 },
        { productId: b.id, quantity: 2 },
      ],
    });

    expect(sale.items).toHaveLength(2);
    // Sin acceso indexado: noUncheckedIndexedAccess tiparía items[0] como
    // undefined. map() evita la indexación y el assert es más expresivo.
    expect(sale.items.map((item) => item.unitPrice)).toEqual([100, 50.5]);
    expect(sale.items.map((item) => item.total)).toEqual([500, 101]);
    expect(sale.total).toBe(601);

    await expectStock(a.id, 15);
    await expectStock(b.id, 8);

    // Un movimiento OUT por línea, conectado a la venta
    const { rows: movRows } = await testPool.query(
      'SELECT COUNT(*) FROM movements WHERE sale_id = $1 AND type = $2',
      [sale.id, 'OUT'],
    );
    expect(Number(movRows[0].count)).toBe(2);
  });

  it('2. stock insuficiente en UNA línea revierte TODO (rollback total)', async () => {
    const user = await createUser();
    const a = await createProduct({ stock: 10 });
    const b = await createProduct({ stock: 1 });

    await expect(
      repo.createWithItems({
        userId: user.id,
        items: [
          { productId: a.id, quantity: 2 }, // esta línea alcanzaría...
          { productId: b.id, quantity: 5 }, // pero esta NO
        ],
      }),
    ).rejects.toThrow('Insufficient stock');

    // Ni la línea que alcanzaba se descuenta: todo o nada
    await expectStock(a.id, 10);
    await expectStock(b.id, 1);

    const { rows: saleRows } = await testPool.query('SELECT COUNT(*) FROM sales');
    expect(Number(saleRows[0].count)).toBe(0);
    const { rows: movRows } = await testPool.query('SELECT COUNT(*) FROM movements');
    expect(Number(movRows[0].count)).toBe(0);
  });

  it('3. producto inactivo en cualquier línea revierte la venta completa', async () => {
    const user = await createUser();
    const active = await createProduct({ stock: 10 });
    const inactive = await createProduct({ stock: 10, active: false });

    await expect(
      repo.createWithItems({
        userId: user.id,
        items: [
          { productId: active.id, quantity: 1 },
          { productId: inactive.id, quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Product is inactive');

    await expectStock(active.id, 10);
    const { rows } = await testPool.query('SELECT COUNT(*) FROM sales');
    expect(Number(rows[0].count)).toBe(0);
  });

  it('4. producto inexistente revierte la venta completa', async () => {
    const user = await createUser();
    const a = await createProduct({ stock: 10 });

    await expect(
      repo.createWithItems({
        userId: user.id,
        items: [
          { productId: a.id, quantity: 1 },
          { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Product not found');

    await expectStock(a.id, 10);
    const { rows } = await testPool.query('SELECT COUNT(*) FROM sales');
    expect(Number(rows[0].count)).toBe(0);
  });

  it('5. findById devuelve el detalle con nombre y SKU del producto', async () => {
    const user = await createUser();
    const a = await createProduct({ stock: 20, price: '80.00' });

    const created = await repo.createWithItems({
      userId: user.id,
      items: [{ productId: a.id, quantity: 3 }],
    });

    const sale = await repo.findById(created.id);
    expectSome(sale);
    expect(sale.items).toHaveLength(1);
    expect(sale.items.map((item) => item.productName)).toEqual([a.name]);
    expect(sale.items.map((item) => item.productSku)).toEqual([a.sku]);
    expect(sale.items.map((item) => item.total)).toEqual([240]);
    expect(sale.total).toBe(240);
  });

  it('6. findAll agrupa resúmenes con total e itemCount', async () => {
    const user = await createUser();
    const a = await createProduct({ stock: 30, price: '10.00' });
    const b = await createProduct({ stock: 30, price: '20.00' });

    const sale = await repo.createWithItems({
      userId: user.id,
      items: [
        { productId: a.id, quantity: 2 },
        { productId: b.id, quantity: 1 },
      ],
    });

    const list = await repo.findAll();
    expect(list).toHaveLength(1);
    expect(list.map((s) => s.id)).toEqual([sale.id]);
    expect(list.map((s) => s.itemCount)).toEqual([2]);
    expect(list.map((s) => s.total)).toEqual([40]);
  });
});