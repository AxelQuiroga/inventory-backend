import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeactivateProduct } from '../../application/products/deactivate-product';
import { ReactivateProduct } from '../../application/products/reactivate-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import { createProductSchema, updateProductSchema, productQuerySchema, productParamsSchema } from '../schemas/product-schema';

export class ProductController {
  constructor(
    private createProductUseCase: CreateProduct,
    private updateProductUseCase: UpdateProduct,
    private deactivateProductUseCase: DeactivateProduct,
    private reactivateProductUseCase: ReactivateProduct,
    private getProductUseCase: GetProduct,
    private listProductsUseCase: ListProducts,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      const product = await this.createProductUseCase.execute(parsed.data);
      return reply.status(201).send(product);
    } catch (error) {
      return this.handleError(error, reply);
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
      return this.handleError(error, reply);
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
      return this.handleError(error, reply);
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
      return this.handleError(error, reply);
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
      return this.handleError(error, reply);
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
      return this.handleError(error, reply);
    }
  }

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof Error) {
      if (error.message === 'SKU already exists') {
        return reply.status(409).send({ message: error.message });
      }
      if (error.message === 'Invalid product data') {
        return reply.status(400).send({ message: error.message });
      }
    }
    return reply.status(500).send({ message: 'Internal server error' });
  }
}