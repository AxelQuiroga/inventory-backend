import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateSale } from '../../application/sales/create-sale';
import { GetSale } from '../../application/sales/get-sale';
import { ListSales } from '../../application/sales/list-sales';
import { createSaleSchema, saleParamsSchema } from '../schemas/sale-schema';

export class SaleController {
  constructor(
    private createSaleUseCase: CreateSale,
    private getSaleUseCase: GetSale,
    private listSalesUseCase: ListSales,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      const user = request.user as { userId: string };
      const sale = await this.createSaleUseCase.execute({
        items: parsed.data.items,
        userId: user.userId,
      });
      return reply.status(201).send(sale);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const params = saleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }

    try {
      const sale = await this.getSaleUseCase.execute(params.data.id);
      if (!sale) {
        return reply.status(404).send({ message: 'Sale not found' });
      }
      return reply.send(sale);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async getAll(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sales = await this.listSalesUseCase.execute();
      return reply.send(sales);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  private handleError(error: unknown, reply: FastifyReply, request: FastifyRequest) {
    if (error instanceof Error) {
      if (error.message === 'Product not found') {
        return reply.status(404).send({ message: 'Product not found' });
      }
      if (error.message === 'Product is inactive') {
        return reply.status(400).send({ message: 'Product is inactive' });
      }
      if (error.message === 'Insufficient stock') {
        return reply.status(400).send({ message: 'Insufficient stock' });
      }
    }
    // El 500 genérico enmascara la causa real: el log lo deja visible (la
    // misma lección que el incidente de la columna unit en productos).
    request.log.error({ error }, 'Unexpected error in sale controller');
    return reply.status(500).send({ message: 'Internal server error' });
  }
}