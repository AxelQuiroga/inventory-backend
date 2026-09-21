import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildE2eApp,
  closeE2eApp,
  resetE2eDb,
  authHeader,
  createProductViaApi,
  type E2eCredentials,
} from '../../infrastructure/database/test-e2e-utils';

// Flujo completo HTTP → Routes → Controllers → Use Cases → Repositories → PG.
// Regla de negocio clave (definida con el usuario): el selector muestra
// disponible = stock real − carrito, y la venta se descuenta UNA sola vez
// al confirmar, de forma atómica (todo o nada).
describe('SALES E2E', () => {
  let app: FastifyInstance;
  let credentials: E2eCredentials;
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;

  async function login(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    if (res.statusCode !== 200) {
      throw new Error(`login failed (${res.statusCode}): ${res.body}`);
    }
    return JSON.parse(res.body).token;
  }

  beforeAll(async () => {
    app = await buildE2eApp();
    credentials = await resetE2eDb();
    adminToken = await login(credentials.admin.email, credentials.admin.password);
    operatorToken = await login(credentials.operator.email, credentials.operator.password);
    viewerToken = await login(credentials.viewer.email, credentials.viewer.password);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('venta multi-línea: 201, stock PERSISTIDO descontado y movimientos OUT con trazabilidad', async () => {
    const a = await createProductViaApi(app, adminToken, { price: 100, initialStock: 20 });
    const b = await createProductViaApi(app, adminToken, { price: 50, initialStock: 10 });

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: {
        items: [
          { productId: a.id, quantity: 5 },
          { productId: b.id, quantity: 2 },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const sale = JSON.parse(res.body);
    expect(sale.items).toHaveLength(2);
    // Precio congelado del producto + total derivado por línea y de la venta
    expect(sale.items[0].unitPrice).toBe(100);
    expect(sale.items[0].total).toBe(500);
    expect(sale.items[1].unitPrice).toBe(50);
    expect(sale.items[1].total).toBe(100);
    expect(sale.total).toBe(600);

    // El stock queda PERSISTIDO (no es la respuesta la que miente)
    const aAfter = await app.inject({ method: 'GET', url: `/products/${a.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(aAfter.body).stock).toBe(15);
    const bAfter = await app.inject({ method: 'GET', url: `/products/${b.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(bAfter.body).stock).toBe(8);

    // Trazabilidad: OUT por cada línea con la razón "Venta"
    const history = await app.inject({ method: 'GET', url: `/movements/history/${a.id}`, headers: authHeader(adminToken) });
    const movements = JSON.parse(history.body);
    expect(movements).toHaveLength(2); // IN inicial + OUT venta
    expect(movements[0].type).toBe('OUT');
    expect(movements[0].quantity).toBe(5);
    expect(movements[0].reason).toBe('Venta');
  });

  it('stock insuficiente en UNA línea: 400 y rollback total (ni la línea que alcanzaba se descuenta)', async () => {
    const a = await createProductViaApi(app, adminToken, { price: 10, initialStock: 10 });
    const b = await createProductViaApi(app, adminToken, { price: 10, initialStock: 1 });

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: {
        items: [
          { productId: a.id, quantity: 2 }, // esta línea alcanzaría...
          { productId: b.id, quantity: 5 }, // pero esta NO
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Insufficient stock');

    // Rollback total: A sigue con 10 (el descuento de su línea se revirtió)
    const aAfter = await app.inject({ method: 'GET', url: `/products/${a.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(aAfter.body).stock).toBe(10);
    const bAfter = await app.inject({ method: 'GET', url: `/products/${b.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(bAfter.body).stock).toBe(1);

    // Sin movimientos OUT de venta (solo el IN inicial)
    const history = await app.inject({ method: 'GET', url: `/movements/history/${a.id}`, headers: authHeader(adminToken) });
    const movements = JSON.parse(history.body);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('IN');
  });

  it('producto inactivo en la venta: 400 y nada se descuenta', async () => {
    const product = await createProductViaApi(app, adminToken, { price: 10, initialStock: 10 });
    await app.inject({
      method: 'POST',
      url: `/products/${product.id}/deactivate`,
      headers: authHeader(adminToken),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: { items: [{ productId: product.id, quantity: 1 }] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Product is inactive');

    const after = await app.inject({ method: 'GET', url: `/products/${product.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(after.body).stock).toBe(10);
  });

  it('OPERATOR puede registrar ventas (rol de la operación diaria)', async () => {
    // Crear productos es ADMIN-only: el OPERATOR solo vende
    const product = await createProductViaApi(app, adminToken, { price: 25, initialStock: 7 });

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(operatorToken),
      payload: { items: [{ productId: product.id, quantity: 3 }] },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).total).toBe(75);

    const after = await app.inject({ method: 'GET', url: `/products/${product.id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(after.body).stock).toBe(4);
  });

  it('VIEWER no puede registrar ventas: 403', async () => {
    const product = await createProductViaApi(app, adminToken, { price: 10, initialStock: 5 });

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(viewerToken),
      payload: { items: [{ productId: product.id, quantity: 1 }] },
    });

    expect(res.statusCode).toBe(403);

    // VIEWER sí puede consultar, pero el stock no se tocó
    const after = await app.inject({ method: 'GET', url: `/products/${product.id}`, headers: authHeader(viewerToken) });
    expect(JSON.parse(after.body).stock).toBe(5);
  });

  it('venta sin ítems: 400 de validación, sin tocar la DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: { items: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /sales/:id devuelve el detalle con nombre y SKU de cada producto', async () => {
    const product = await createProductViaApi(app, adminToken, { price: 30, initialStock: 12 });
    const create = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: { items: [{ productId: product.id, quantity: 4 }] },
    });
    const created = JSON.parse(create.body);

    const res = await app.inject({ method: 'GET', url: `/sales/${created.id}`, headers: authHeader(adminToken) });
    expect(res.statusCode).toBe(200);
    const sale = JSON.parse(res.body);
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].productName).toBeDefined();
    expect(sale.items[0].productSku).toBe(product.sku);
    expect(sale.total).toBe(120);
  });

  it('GET /sales lista las ventas con total e itemCount', async () => {
    const product = await createProductViaApi(app, adminToken, { price: 12, initialStock: 20 });
    const create = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: authHeader(adminToken),
      payload: { items: [{ productId: product.id, quantity: 5 }] },
    });
    const created = JSON.parse(create.body);

    const res = await app.inject({ method: 'GET', url: '/sales', headers: authHeader(adminToken) });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.body);
    const found = list.find((s: { id: string }) => s.id === created.id);
    expect(found).toBeDefined();
    expect(found.itemCount).toBe(1);
    expect(found.total).toBe(60);
  });
});