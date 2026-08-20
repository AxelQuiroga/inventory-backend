import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeleteProduct } from '../../application/products/delete-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import { createProductSchema, updateProductSchema, productQuerySchema } from '../schemas/product-schema';

export class ProductController {
  constructor(
    private createProductUseCase: CreateProduct,
    private updateProductUseCase: UpdateProduct,
    private deleteProductUseCase: DeleteProduct,
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

    try {
      const products = await this.listProductsUseCase.execute(parsed.data);
      return reply.send(products);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

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
    const { id } = request.params as { id: string };
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

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    try {
      const deleted = await this.deleteProductUseCase.execute(id);
      if (!deleted) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.status(204).send();
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