import type { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product-controller';
import { DrizzleProductRepository } from '../../infrastructure/repositories/product-repository';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeleteProduct } from '../../application/products/delete-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import { authenticate } from '../middleware/authenticate';

export async function productRoutes(app: FastifyInstance) {
  const repository = new DrizzleProductRepository();
  const createProduct = new CreateProduct(repository);
  const updateProduct = new UpdateProduct(repository);
  const deleteProduct = new DeleteProduct(repository);
  const getProduct = new GetProduct(repository);
  const listProducts = new ListProducts(repository);

  const controller = new ProductController(
    createProduct,
    updateProduct,
    deleteProduct,
    getProduct,
    listProducts,
  );

  app.addHook('preHandler', authenticate);

  app.post('/products', controller.create.bind(controller));
  app.get('/products', controller.getAll.bind(controller));
  app.get('/products/:id', controller.getById.bind(controller));
  app.put('/products/:id', controller.update.bind(controller));
  app.delete('/products/:id', controller.delete.bind(controller));
}