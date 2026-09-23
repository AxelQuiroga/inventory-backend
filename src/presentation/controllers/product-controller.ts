import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeactivateProduct } from '../../application/products/deactivate-product';
import { ReactivateProduct } from '../../application/products/reactivate-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import { GetProductSummary } from '../../application/products/get-product-summary';
import { createProductSchema, updateProductSchema, productQuerySchema, productParamsSchema } from '../schemas/product-schema';

export class ProductController {
  constructor(
    private createProductUseCase: CreateProduct,
    private updateProductUseCase: UpdateProduct,
    private deactivateProductUseCase: DeactivateProduct,
    private reactivateProductUseCase: ReactivateProduct,
    private getProductUseCase: GetProduct,
    private listProductsUseCase: ListProducts,
    private getProductSummaryUseCase: GetProductSummary,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      // El movimiento de stock inicial queda a nombre del usuario autenticado
      const user = request.user as { userId: string };
      const product = await this.createProductUseCase.execute(parsed.data, {
        initialStock: parsed.data.initialStock,
        userId: user.userId,
      });
      return reply.status(201).send(product);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async getAll(request: FastifyRequest, reply: FastifyReply) {
    const parsed = productQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid query', errors: parsed.error.flatten() });
    }

    // includeInactive es un mecanismo reservado a ADMIN
    if (parsed.data.includeInactive) {
      const user = request.user as { role?: string } | undefined;
      if (user?.role !== 'ADMIN') {
        return reply.status(403).send({ message: 'Forbidden' });
      }
    }

    try {
      const products = await this.listProductsUseCase.execute(parsed.data);
      return reply.send(products);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async getSummary(request: FastifyRequest, reply: FastifyReply) {
    try {
      const summary = await this.getProductSummaryUseCase.execute();
      return reply.send(summary);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const params = productParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }
    const { id } = params.data;

    try {
      const product = await this.getProductUseCase.execute(id);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const params = productParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }
    const { id } = params.data;
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      const product = await this.updateProductUseCase.execute(id, parsed.data);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async deactivate(request: FastifyRequest, reply: FastifyReply) {
    const params = productParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }
    const { id } = params.data;

    try {
      const product = await this.deactivateProductUseCase.execute(id);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async reactivate(request: FastifyRequest, reply: FastifyReply) {
    const params = productParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }
    const { id } = params.data;

    try {
      const product = await this.reactivateProductUseCase.execute(id);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  private handleError(error: unknown, reply: FastifyReply, request: FastifyRequest) {
    if (error instanceof Error) {
      if (error.message === 'SKU already exists') {
        return reply.status(409).send({ message: error.message });
      }
      if (error.message === 'Invalid product data') {
        return reply.status(400).send({ message: error.message });
      }
    }
    // La violación del constraint único de SKU (23505) es defensa en
    // profundidad: findBySku ya lo cubre, pero entre ese check y el INSERT
    // puede colarse una carrera (o el producto puede existir sin pasar por
    // el use case). Sin este mapeo, Postgres la enmascara como 500.
    const dbError = error as { code?: string };
    if (dbError.code === '23505') {
      request.log.warn({ error }, 'Unique constraint violation on products');
      return reply.status(409).send({ message: 'SKU already exists' });
    }
    // El 500 genérico enmascara la causa real (ej: esquema de DB
    // desincronizado, como la columna unit que provocó este incidente).
    // Sin el log, el diagnóstico es a ciegas: "no hay ningún error real".
    request.log.error({ error }, 'Unexpected error in product controller');
    return reply.status(500).send({ message: 'Internal server error' });
  }
}