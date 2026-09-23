import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import {
  buildE2eApp,
  closeE2eApp,
  resetE2eDb,
  authHeader,
  uniqueSku,
  createProductViaApi,
  type E2eCredentials,
} from '../../infrastructure/database/test-e2e-utils';

// E2E del ciclo de vida de productos y sus filtros, por HTTP real.
// Invariante clave: un producto nace con stock 0; el stock entra por movimientos.

let app: FastifyInstance;
let creds: E2eCredentials;
let adminToken: string;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).token as string;
}

async function addStock(productId: string, quantity: number) {
  const res = await app.inject({
    method: 'POST',
    url: '/movements/entry',
    headers: authHeader(adminToken),
    payload: { productId, quantity, reason: 'Stock inicial' },
  });
  expect(res.statusCode).toBe(201);
}

beforeAll(async () => {
  app = await buildE2eApp();
});

afterAll(async () => closeE2eApp(app));

beforeEach(async () => {
  creds = await resetE2eDb();
  adminToken = await login(creds.admin.email, creds.admin.password);
});

describe('PRODUCTS E2E — ciclo de vida', () => {
  it('crear producto: 201, nace activo y con stock 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: 'Martillo', sku: uniqueSku(), category: 'Herramientas', price: 25.5 },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Martillo');
    expect(body.stock).toBe(0);
    expect(body.active).toBe(true);
    expect(body.minStock).toBe(5); // default del schema
    expect(body.id).toBeTruthy();
  });

  it('crear producto con SKU duplicado: 409', async () => {
    const sku = uniqueSku();
    await createProductViaApi(app, adminToken, { sku });

    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: 'Duplicado', sku, category: 'E2E', price: 1 },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toBe('SKU already exists');
  });

  it('crear producto con datos inválidos: 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: '', sku: '', category: '', price: -5 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('consultar producto por id: 200; inexistente: 404; malformado: 400', async () => {
    const { id } = await createProductViaApi(app, adminToken);

    const found = await app.inject({ method: 'GET', url: `/products/${id}`, headers: authHeader(adminToken) });
    expect(found.statusCode).toBe(200);
    expect(JSON.parse(found.body).id).toBe(id);

    const missing = await app.inject({
      method: 'GET',
      url: `/products/${randomUUID()}`,
      headers: authHeader(adminToken),
    });
    expect(missing.statusCode).toBe(404);

    const malformed = await app.inject({
      method: 'GET',
      url: '/products/not-a-uuid',
      headers: authHeader(adminToken),
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('actualizar producto: 200 y persiste los cambios', async () => {
    const { id, sku } = await createProductViaApi(app, adminToken, { name: 'Nombre viejo', price: 10 });

    const res = await app.inject({
      method: 'PUT',
      url: `/products/${id}`,
      headers: authHeader(adminToken),
      payload: { name: 'Nombre nuevo', price: 99.99, minStock: 8 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Nombre nuevo');
    expect(body.price).toBe(99.99);
    expect(body.minStock).toBe(8);
    expect(body.sku).toBe(sku); // el SKU no cambió si no se pidió

    // Persistencia real: un GET posterior devuelve lo actualizado
    const verify = await app.inject({ method: 'GET', url: `/products/${id}`, headers: authHeader(adminToken) });
    expect(JSON.parse(verify.body).name).toBe('Nombre nuevo');
  });

  it('desactivar producto: active=false, sale del listado, sigue consultable por id', async () => {
    const { id } = await createProductViaApi(app, adminToken, { name: 'A desactivar' });

    const off = await app.inject({
      method: 'POST',
      url: `/products/${id}/deactivate`,
      headers: authHeader(adminToken),
    });
    expect(off.statusCode).toBe(200);
    expect(JSON.parse(off.body).active).toBe(false);

    // Ya no aparece en el listado por defecto
    const list = await app.inject({ method: 'GET', url: '/products', headers: authHeader(adminToken) });
    const ids = JSON.parse(list.body).data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(id);

    // Pero sigue consultable por id con su historial intacto (soft delete)
    const byId = await app.inject({ method: 'GET', url: `/products/${id}`, headers: authHeader(adminToken) });
    expect(byId.statusCode).toBe(200);
    expect(JSON.parse(byId.body).active).toBe(false);

    // ADMIN puede verlo con includeInactive=true
    const withInactive = await app.inject({
      method: 'GET',
      url: '/products?includeInactive=true',
      headers: authHeader(adminToken),
    });
    const inactiveIds = JSON.parse(withInactive.body).data.map((p: { id: string }) => p.id);
    expect(inactiveIds).toContain(id);
  });

  it('reactivar producto: vuelve al listado activo', async () => {
    const { id } = await createProductViaApi(app, adminToken, { name: 'A reactivar' });

    await app.inject({ method: 'POST', url: `/products/${id}/deactivate`, headers: authHeader(adminToken) });

    const on = await app.inject({
      method: 'POST',
      url: `/products/${id}/reactivate`,
      headers: authHeader(adminToken),
    });
    expect(on.statusCode).toBe(200);
    expect(JSON.parse(on.body).active).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/products', headers: authHeader(adminToken) });
    const ids = JSON.parse(list.body).data.map((p: { id: string }) => p.id);
    expect(ids).toContain(id);
  });
});

describe('PRODUCTS E2E — filtros', () => {
  it('search filtra por fragmento del nombre (case-insensitive)', async () => {
    await createProductViaApi(app, adminToken, { name: 'Martillo E2E Premium' });
    await createProductViaApi(app, adminToken, { name: 'Taladro E2E' });

    const res = await app.inject({
      method: 'GET',
      url: '/products?search=martillo',
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).data.map((p: { name: string }) => p.name);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe('Martillo E2E Premium');
  });

  it('category filtra por categoría exacta', async () => {
    await createProductViaApi(app, adminToken, { name: 'Producto A', category: 'Ferreteria' });
    await createProductViaApi(app, adminToken, { name: 'Producto B', category: 'Electricidad' });

    const res = await app.inject({
      method: 'GET',
      url: '/products?category=Electricidad',
      headers: authHeader(adminToken),
    });

    const names = JSON.parse(res.body).data.map((p: { name: string }) => p.name);
    expect(names).toEqual(['Producto B']);
  });

  it('minPrice/maxPrice filtran por rango de precio', async () => {
    await createProductViaApi(app, adminToken, { name: 'Barato', price: 5 });
    await createProductViaApi(app, adminToken, { name: 'Medio', price: 50 });
    await createProductViaApi(app, adminToken, { name: 'Caro', price: 500 });

    const res = await app.inject({
      method: 'GET',
      url: '/products?minPrice=10&maxPrice=100',
      headers: authHeader(adminToken),
    });

    const names = JSON.parse(res.body).data.map((p: { name: string }) => p.name);
    expect(names).toEqual(['Medio']);
  });

  it('sortBy=price&order=asc ordena ascendentemente', async () => {
    await createProductViaApi(app, adminToken, { name: 'Precio 30', price: 30 });
    await createProductViaApi(app, adminToken, { name: 'Precio 10', price: 10 });
    await createProductViaApi(app, adminToken, { name: 'Precio 20', price: 20 });

    const res = await app.inject({
      method: 'GET',
      url: '/products?sortBy=price&order=asc',
      headers: authHeader(adminToken),
    });

    const names = JSON.parse(res.body).data.map((p: { name: string }) => p.name);
    expect(names).toEqual(['Precio 10', 'Precio 20', 'Precio 30']);
  });

  it('lowStock=true devuelve solo productos con stock <= minStock', async () => {
    // Bajo stock: nace con 0 y minStock 10 → 0 <= 10
    await createProductViaApi(app, adminToken, { name: 'Bajo stock', minStock: 10 });
    // Stock sano: entra 8 con minStock 2 → 8 > 2
    const sano = await createProductViaApi(app, adminToken, { name: 'Stock sano', minStock: 2 });
    await addStock(sano.id, 8);

    const res = await app.inject({
      method: 'GET',
      url: '/products?lowStock=true',
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).data.map((p: { name: string }) => p.name);
    expect(names).toContain('Bajo stock');
    expect(names).not.toContain('Stock sano');
  });

  it('limit pagina el listado y el contrato expone { data, total }', async () => {
    await createProductViaApi(app, adminToken, { name: 'Pag A' });
    await createProductViaApi(app, adminToken, { name: 'Pag B' });
    await createProductViaApi(app, adminToken, { name: 'Pag C' });

    const res = await app.inject({
      method: 'GET',
      url: '/products?limit=2',
      headers: authHeader(adminToken),
    });

    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(3); // el total NO se recorta con el limit
  });
});

describe('PRODUCTS E2E — creación con stock inicial', () => {
  it('initialStock: 201 con stock cargado Y movimiento IN registrado (atómico)', async () => {
    const sku = uniqueSku();
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: {
        name: 'Tornillo',
        sku,
        category: 'Ferretería',
        price: 1.5,
        minStock: 100,
        initialStock: 250,
      },
    });

    expect(res.statusCode).toBe(201);
    const product = JSON.parse(res.body);
    expect(product.stock).toBe(250); // el stock llega con la creación

    // El movimiento IN quedó registrado (trazabilidad del stock inicial)
    const history = await app.inject({
      method: 'GET',
      url: `/movements/history/${product.id}`,
      headers: authHeader(adminToken),
    });
    expect(history.statusCode).toBe(200);
    const movements = JSON.parse(history.body);
    expect(movements.data).toHaveLength(1);
    expect(movements.total).toBe(1);
    expect(movements.data[0].type).toBe('IN');
    expect(movements.data[0].quantity).toBe(250);
    expect(movements.data[0].reason).toBe('Stock inicial');

    // El stock DEBE quedar persistido: la respuesta 201 no puede mentir
    const persisted = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: authHeader(adminToken),
    });
    expect(persisted.statusCode).toBe(200);
    expect(JSON.parse(persisted.body).stock).toBe(250);
  });

  it('initialStock 0 (o ausente): producto con stock 0 y SIN movimientos', async () => {
    const sku = uniqueSku();
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: { name: 'Sin stock', sku, category: 'E2E', price: 1, initialStock: 0 },
    });

    expect(res.statusCode).toBe(201);
    const product = JSON.parse(res.body);
    expect(product.stock).toBe(0);

    const history = await app.inject({
      method: 'GET',
      url: `/movements/history/${product.id}`,
      headers: authHeader(adminToken),
    });
    expect(JSON.parse(history.body).data).toHaveLength(0);
  });

  it('initialStock inválido (negativo o no entero): 400 y NO se crea el producto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(adminToken),
      payload: {
        name: 'Inválido', sku: uniqueSku(), category: 'E2E',
        price: 1, initialStock: -3,
      },
    });

    expect(res.statusCode).toBe(400);

    // El listado no contiene el producto: la validación falló antes de crear
    const list = await app.inject({
      method: 'GET',
      url: '/products',
      headers: authHeader(adminToken),
    });
    const names = JSON.parse(list.body).data.map((p: { name: string }) => p.name);
    expect(names).not.toContain('Inválido');
  });

  it('OPERATOR no puede crear producto (ni con initialStock): 403', async () => {
    const operatorToken = await login(creds.operator.email, creds.operator.password);
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: authHeader(operatorToken),
      payload: {
        name: 'X', sku: uniqueSku(), category: 'E2E',
        price: 1, initialStock: 5,
      },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('PRODUCTS E2E — GET /products/summary (agregados del dashboard)', () => {
  it('devuelve { total, totalStock, lowStock } contando solo activos', async () => {
    // Activo con stock sano
    const sano = await createProductViaApi(app, adminToken, { name: 'Sano', minStock: 2 });
    await addStock(sano.id, 8);

    // Activo con stock bajo (nace 0 <= minStock 5)
    await createProductViaApi(app, adminToken, { name: 'Bajo', minStock: 5 });

    // Se desactiva: NO debe contar en ningún agregado
    const inactivo = await createProductViaApi(app, adminToken, { name: 'Inactivo', minStock: 5 });
    await app.inject({
      method: 'POST',
      url: `/products/${inactivo.id}/deactivate`,
      headers: authHeader(adminToken),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/products/summary',
      headers: authHeader(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const summary = JSON.parse(res.body);
    expect(summary.total).toBe(2);          // Sano + Bajo (el inactivo no suma)
    expect(summary.totalStock).toBe(8);     // solo el stock de Sano
    expect(summary.lowStock).toBe(1);       // solo Bajo
  });

  it('sin token: 401', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/products/summary' });
    expect(noToken.statusCode).toBe(401);
  });
});
