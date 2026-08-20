import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeleteProduct } from '../../application/products/delete-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import type { CreateProductInput, UpdateProductInput, ProductQueryInput } from '../schemas/product-schema';

export class ProductController {
  constructor(
    private createProduct: CreateProduct,
    private updateProduct: UpdateProduct,
    private deleteProduct: DeleteProduct,
    private getProduct: GetProduct,
    private listProducts: ListProducts,
  ) {}

  async create(request: FastifyRequest<{ Body: CreateProductInput }>, reply: FastifyReply) {
    try {
      const product = await this.createProduct.execute(request.body);
      return reply.status(201).send(product);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async getAll(request: FastifyRequest<{ Querystring: ProductQueryInput }>, reply: FastifyReply) {
    try {
      const products = await this.listProducts.execute(request.query);
      return reply.send(products);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const product = await this.getProduct.execute(request.params.id);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async update(request: FastifyRequest<{ Params: { id: string }; Body: UpdateProductInput }>, reply: FastifyReply) {
    try {
      const product = await this.updateProduct.execute(request.params.id, request.body);
      if (!product) {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.send(product);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const deleted = await this.deleteProduct.execute(request.params.id);
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