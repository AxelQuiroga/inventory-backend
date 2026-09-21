import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { productRoutes } from './presentation/routes/product-routes';
import { authRoutes } from './presentation/routes/auth-routes';
import { movementRoutes } from './presentation/routes/movement-routes';
import { saleRoutes } from './presentation/routes/sale-routes';

// Factory de la aplicación: separada del bootstrap (index.ts) para que los
// tests HTTP puedan construir la app con app.inject() sin levantar el server.
export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.register(cors);
  app.register(jwt, { secret: process.env.JWT_SECRET! });

  app.register(authRoutes);
  app.register(movementRoutes);
  app.register(productRoutes);
  app.register(saleRoutes);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}