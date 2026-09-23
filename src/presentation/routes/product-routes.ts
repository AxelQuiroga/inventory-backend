import type { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/product-controller';
import { DrizzleProductRepository } from '../../infrastructure/repositories/product-repository';
import { CreateProduct } from '../../application/products/create-product';
import { UpdateProduct } from '../../application/products/update-product';
import { DeactivateProduct } from '../../application/products/deactivate-product';
import { ReactivateProduct } from '../../application/products/reactivate-product';
import { GetProduct } from '../../application/products/get-product';
import { ListProducts } from '../../application/products/list-products';
import { GetProductSummary } from '../../application/products/get-product-summary';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export async function productRoutes(app: FastifyInstance) {
  const repository = new DrizzleProductRepository();
  const createProduct = new CreateProduct(repository);
  const updateProduct = new UpdateProduct(repository);
  const deactivateProduct = new DeactivateProduct(repository);
  const reactivateProduct = new ReactivateProduct(repository);
  const getProduct = new GetProduct(repository);
  const listProducts = new ListProducts(repository);
  const getProductSummary = new GetProductSummary(repository);

  const controller = new ProductController(
    createProduct,
    updateProduct,
    deactivateProduct,
    reactivateProduct,
    getProduct,
    listProducts,
    getProductSummary,
  );

  // Matriz de autorización (consulta: cualquier rol autenticado;
  // creación/modificación/activación: solo ADMIN)
  app.post('/products', { preHandler: [authenticate, authorize('ADMIN')] }, controller.create.bind(controller));
  app.get('/products', { preHandler: [authenticate] }, controller.getAll.bind(controller));
  // La ruta estática /products/summary se registra ANTES de la paramétrica
  // /products/:id para que el router no la capture como un id (find-my-way
  // prioriza estáticas sobre parámetros, pero esto hace la intención explícita).
  app.get('/products/summary', { preHandler: [authenticate] }, controller.getSummary.bind(controller));
  app.get('/products/:id', { preHandler: [authenticate] }, controller.getById.bind(controller));
  app.put('/products/:id', { preHandler: [authenticate, authorize('ADMIN')] }, controller.update.bind(controller));
  app.post('/products/:id/deactivate', { preHandler: [authenticate, authorize('ADMIN')] }, controller.deactivate.bind(controller));
  app.post('/products/:id/reactivate', { preHandler: [authenticate, authorize('ADMIN')] }, controller.reactivate.bind(controller));
}