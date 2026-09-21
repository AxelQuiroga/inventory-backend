import type { FastifyInstance } from 'fastify';
import { SaleController } from '../controllers/sale-controller';
import { DrizzleSaleRepository } from '../../infrastructure/repositories/sale-repository';
import { CreateSale } from '../../application/sales/create-sale';
import { GetSale } from '../../application/sales/get-sale';
import { ListSales } from '../../application/sales/list-sales';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export async function saleRoutes(app: FastifyInstance) {
  const repository = new DrizzleSaleRepository();
  const createSale = new CreateSale(repository);
  const getSale = new GetSale(repository);
  const listSales = new ListSales(repository);

  const controller = new SaleController(createSale, getSale, listSales);

  // Matriz de autorización: registrar ventas = ADMIN + OPERATOR (la
  // operación diaria); consultar ventas = cualquier rol autenticado.
  app.post('/sales', { preHandler: [authenticate, authorize('ADMIN', 'OPERATOR')] }, controller.create.bind(controller));
  app.get('/sales', { preHandler: [authenticate] }, controller.getAll.bind(controller));
  app.get('/sales/:id', { preHandler: [authenticate] }, controller.getById.bind(controller));
}