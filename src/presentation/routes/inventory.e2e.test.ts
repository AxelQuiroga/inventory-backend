import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import {
  buildE2eApp,
  closeE2eApp,
  resetE2eDb,
  authHeader,
  createProductViaApi,
  testPool,
  type E2eCredentials,
} from '../../infrastructure/database/test-e2e-utils';

// E2E de INVENTORY + ATOMICIDAD: el stock solo cambia por movimientos,
// toda operación deja rastro, y un fallo no puede dejar estado parcial.

let app: FastifyInstance;
let creds: E2eCredentials;
let adminToken: string;
let operatorToken: string;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).token as string;
}

async function getCurrentStock(productId: string): Promise<number> {
  const { rows } = await testPool.query('SELECT stock FROM products WHERE id = $1', [productId]);
  return Number(rows[0].stock);
}

async function countMovements(productId: string): Promise<number> {
  const { rows } = await testPool.query('SELECT COUNT(*)::int AS n FROM movements WHERE product_id = $1', [productId]);
  return rows[0].n;
}

beforeAll(async () => {
  app = await buildE2eApp();
});

afterAll(async () => closeE2eApp(app));

beforeEach(async () => {
  creds = await resetE2eDb();
  adminToken = await login(creds.admin.email, creds.admin.password);
  operatorToken = await login(creds.operator.email, creds.operator.password);
});

describe('INVENTORY E2E — entradas y salidas', () => {
  it('entry aumenta el stock y genera un movimiento IN', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    const res = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 30, reason: 'Compra a proveedor' },
    });

    expect(res.statusCode).toBe(201);
    const movement = JSON.parse(res.body);
    expect(movement.type).toBe('IN');
    expect(movement.quantity).toBe(30);
    expect(movement.productId).toBe(id);

    expect(await getCurrentStock(id)).toBe(30);
    expect(await countMovements(id)).toBe(1);
  });

  it('exit disminuye el stock y genera un movimiento OUT', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 10, reason: 'Stock inicial' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(operatorToken),
      payload: { productId: id, quantity: 4, reason: 'Venta' },
    });

    expect(res.statusCode).toBe(201);
    const movement = JSON.parse(res.body);
    expect(movement.type).toBe('OUT');
    expect(movement.quantity).toBe(4);

    expect(await getCurrentStock(id)).toBe(6);
    expect(await countMovements(id)).toBe(2);
  });

  it('stock nunca queda negativo: exit mayor que el stock es rechazada (400)', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 5, reason: 'Stock inicial' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 8, reason: 'Venta imposible' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Insufficient stock');

    // La regla 1 se cumple: el stock no cambió
    expect(await getCurrentStock(id)).toBe(5);
    expect(await countMovements(id)).toBe(1);
  });

  it('producto inactivo rechaza movimientos (400) y su stock no cambia', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 3, reason: 'Stock inicial' },
    });
    await app.inject({ method: 'POST', url: `/products/${id}/deactivate`, headers: authHeader(adminToken) });

    const entry = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 1, reason: 'Entrada tardía' },
    });
    expect(entry.statusCode).toBe(400);
    expect(JSON.parse(entry.body).message).toBe('Product is inactive');

    const exit = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 1, reason: 'Salida tardía' },
    });
    expect(exit.statusCode).toBe(400);

    expect(await getCurrentStock(id)).toBe(3);
    expect(await countMovements(id)).toBe(1);
  });

  it('producto inexistente devuelve 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: randomUUID(), quantity: 1, reason: 'Fantasma' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe('Product not found');
  });

  it('cantidad no positiva o payload inválido devuelve 400 (regla 2)', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    const zero = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 0, reason: 'Cero' },
    });
    expect(zero.statusCode).toBe(400);

    const negative = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: -3, reason: 'Negativo' },
    });
    expect(negative.statusCode).toBe(400);

    const noReason = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 1 },
    });
    expect(noReason.statusCode).toBe(400);
  });

  it('el historial refleja todas las operaciones en orden', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 10, reason: 'Alta inicial' },
    });
    await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(operatorToken),
      payload: { productId: id, quantity: 4, reason: 'Venta 1' },
    });
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 2, reason: 'Reposición' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}`,
      headers: authHeader(operatorToken),
    });

    expect(res.statusCode).toBe(200);
    const history = JSON.parse(res.body);
    expect(history).toHaveLength(3);

    // El historial explica el stock final: 10 - 4 + 2 = 8
    expect(await getCurrentStock(id)).toBe(8);

    // Más reciente primero (orden del repositorio)
    expect(history[0].type).toBe('IN');
    expect(history[0].reason).toBe('Reposición');
    expect(history[1].type).toBe('OUT');
    expect(history[2].type).toBe('IN');
  });

  it('el historial se pagina con limit y page (más reciente primero)', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    for (let i = 1; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/movements/entry',
        headers: authHeader(adminToken),
        payload: { productId: id, quantity: i, reason: `Alta ${i}` },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}?limit=2&page=2`,
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const history = JSON.parse(res.body);
    expect(history).toHaveLength(2);

    // Más reciente primero: Alta 5, Alta 4, Alta 3, Alta 2, Alta 1
    // página 2 con limit 2 => [Alta 3, Alta 2]
    expect(history[0]?.reason).toBe('Alta 3');
    expect(history[1]?.reason).toBe('Alta 2');
  });

  it('limit inválido en el historial devuelve 400', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    const res = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}?limit=0`,
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('AUDIT E2E — trazabilidad e inmutabilidad', () => {
  it('cada movement conserva el userId del usuario que lo ejecutó', async () => {
    const operatorLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: creds.operator,
    });
    const operatorPayload = JSON.parse(atob(operatorLogin.body.split('.')[1]!));
    const operatorId = operatorPayload.userId as string;

    const { id } = await createProductViaApi(app, adminToken);

    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(operatorToken),
      payload: { productId: id, quantity: 7, reason: 'Ingreso operador' },
    });
    await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 2, reason: 'Salida admin' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}`,
      headers: authHeader(adminToken),
    });

    const history = JSON.parse(res.body);
    expect(history).toHaveLength(2);
    expect(history.find((m: { reason: string }) => m.reason === 'Ingreso operador').userId).toBe(operatorId);
    expect(history.find((m: { reason: string }) => m.reason === 'Salida admin').userId).toBeTruthy();
  });

  it('los movimientos históricos no pueden modificarse ni eliminarse: no hay rutas de mutación', async () => {
    // Regla 6: los movimientos son inmutables. El contrato HTTP no expone
    // ninguna ruta de escritura sobre /movements/:id.
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 5, reason: 'Original' },
    });

    const history = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}`,
      headers: authHeader(adminToken),
    });
    const movementId = JSON.parse(history.body)[0].id as string;

    const put = await app.inject({
      method: 'PUT',
      url: `/movements/${movementId}`,
      headers: authHeader(adminToken),
      payload: { quantity: 999 },
    });
    expect(put.statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: `/movements/${movementId}`,
      headers: authHeader(adminToken),
    });
    expect(del.statusCode).toBe(404);

    // La fila original está intacta
    const after = await app.inject({
      method: 'GET',
      url: `/movements/history/${id}`,
      headers: authHeader(adminToken),
    });
    const afterBody = JSON.parse(after.body);
    expect(afterBody).toHaveLength(1);
    expect(afterBody[0].quantity).toBe(5);
    expect(afterBody[0].reason).toBe('Original');
  });
});

describe('ATOMICIDAD E2E — stock y movements consistentes', () => {
  it('operación exitosa: stock modificado Y movement creado (ambos o nada)', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 12, reason: 'Compra' },
    });
    await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 5, reason: 'Venta' },
    });

    // stock = 12 - 5 = 7 y exactamente 2 movements explican ese valor
    expect(await getCurrentStock(id)).toBe(7);
    expect(await countMovements(id)).toBe(2);

    const { rows } = await testPool.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE -quantity END), 0) AS expected
       FROM movements WHERE product_id = $1`,
      [id],
    );
    expect(Number(rows[0].expected)).toBe(await getCurrentStock(id));
  });

  it('exit con stock insuficiente NO deja ningún cambio (ni stock ni movement)', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 4, reason: 'Stock inicial' },
    });

    const rejected = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 100, reason: 'Oversell' },
    });
    expect(rejected.statusCode).toBe(400);

    // Sin estado parcial: stock intacto y ningún movement nuevo
    expect(await getCurrentStock(id)).toBe(4);
    expect(await countMovements(id)).toBe(1);
  });

  it('entry sobre producto inexistente NO crea ningún movement huérfano', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: randomUUID(), quantity: 3, reason: 'Fantasma' },
    });

    expect(res.statusCode).toBe(404);

    const { rows } = await testPool.query('SELECT COUNT(*)::int AS n FROM movements');
    expect(rows[0].n).toBe(0);
  });

  it('exit con payload inválido no altera el estado del producto', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 6, reason: 'Stock inicial' },
    });

    const bad = await app.inject({
      method: 'POST',
      url: '/movements/exit',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: -1, reason: 'Inválido' },
    });
    expect(bad.statusCode).toBe(400);

    expect(await getCurrentStock(id)).toBe(6);
    expect(await countMovements(id)).toBe(1);
  });
});

describe('GLOBAL MOVEMENTS E2E — GET /movements y política de visibilidad', () => {
  it('ADMIN ve la vista global con producto unido y autoría (userName)', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 30, reason: 'Compra' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/movements',
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const movements = JSON.parse(res.body);
    expect(movements).toHaveLength(1);
    expect(movements[0].productId).toBe(id);
    expect(movements[0].productSku).toBeTruthy();
    expect(movements[0].productName).toBeTruthy();
    // La autoría es dato del ADMIN: el nombre del usuario operador llega.
    expect(movements[0].userName).toBe('Admin');
  });

  it('OPERATOR y VIEWER ven los movimientos pero SIN autoría (userName null)', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 10, reason: 'Stock inicial' },
    });

    for (const token of [operatorToken, await login(creds.viewer.email, creds.viewer.password)]) {
      const res = await app.inject({ method: 'GET', url: '/movements', headers: authHeader(token) });

      expect(res.statusCode).toBe(200);
      const movements = JSON.parse(res.body);
      expect(movements).toHaveLength(1);
      expect(movements[0].productSku).toBeTruthy(); // el producto sí viaja
      expect(movements[0].userId).toBeNull();
      expect(movements[0].userName).toBeNull(); // la autoría se redacta
    }
  });

  it('OPERATOR que manda ?userId= NO puede filtrar por autor (se ignora)', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    // 2 movimientos del admin para tener volumen
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 10, reason: 'Alta 1' },
    });
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 5, reason: 'Alta 2' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/movements?userId=${creds.admin.id}`,
      headers: authHeader(operatorToken),
    });

    expect(res.statusCode).toBe(200);
    // El filtro de autor se descartó: llegan los 2 movimientos, no 0.
    expect(JSON.parse(res.body)).toHaveLength(2);
  });

  it('los filtros type/productId funcionan para ADMIN', async () => {
    const { id } = await createProductViaApi(app, adminToken);
    await app.inject({
      method: 'POST',
      url: '/movements/entry',
      headers: authHeader(adminToken),
      payload: { productId: id, quantity: 10, reason: 'Entrada' },
    });

    const ins = await app.inject({
      method: 'GET',
      url: '/movements?type=IN',
      headers: authHeader(adminToken),
    });
    expect(JSON.parse(ins.body)).toHaveLength(1);

    const outs = await app.inject({
      method: 'GET',
      url: '/movements?type=OUT',
      headers: authHeader(adminToken),
    });
    expect(JSON.parse(outs.body)).toHaveLength(0);

    const byProduct = await app.inject({
      method: 'GET',
      url: `/movements?productId=${id}`,
      headers: authHeader(adminToken),
    });
    expect(JSON.parse(byProduct.body)).toHaveLength(1);
  });

  it('sin token: 401; query inválida: 400', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/movements' });
    expect(noToken.statusCode).toBe(401);

    const badQuery = await app.inject({
      method: 'GET',
      url: '/movements?limit=0',
      headers: authHeader(adminToken),
    });
    expect(badQuery.statusCode).toBe(400);
  });
});
