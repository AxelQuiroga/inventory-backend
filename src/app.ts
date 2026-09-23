import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadEnv, type Env } from './config/env';
import { JwtService } from './infrastructure/auth/jwt-service';
import { productRoutes } from './presentation/routes/product-routes';
import { authRoutes } from './presentation/routes/auth-routes';
import { movementRoutes } from './presentation/routes/movement-routes';
import { saleRoutes } from './presentation/routes/sale-routes';
import { userRoutes } from './presentation/routes/user-routes';

// Factory de la aplicación: separada del bootstrap (index.ts) para que los
// tests HTTP puedan construir la app con app.inject() sin levantar el server.
//
// El env se valida ACÁ (no al importar): los tests setean process.env a mano
// antes de llamar buildApp(). Acepta un Env inyectado para los casos que
// quieran config puntual sin tocar process.env.
export function buildApp(env: Env = loadEnv()) {
  const app = Fastify({
    logger: false,
  });

  // CORS con allowlist: sin esto @fastify/cors refleja CUALQUIER origin.
  // El frontend usa Authorization header (no cookies), así que el riesgo
  // real es bajo, pero un header de CORS abierto es una bomba de tiempo.
  app.register(cors, {
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // JwtService (jsonwebtoken) decorado en la instancia: authenticate lo usa
  // para verificar y las rutas de auth para firmar. Un único service, una
  // única lib — se acabó la dualidad @fastify/jwt + jsonwebtoken.
  app.decorate('jwtService', new JwtService(env.JWT_SECRET));

  if (env.RATE_LIMIT_ENABLED) {
    // global:false → el plugin solo aplica donde la RUTA lo marque explícitamente
    // (auth-routes lo hace en POST /auth/login, el único endpoint público que
    // ejecuta bcrypt cost 12). El resto de la API queda fuera del rate limit.
    app.register(rateLimit, { global: false });
  }

  app.register(authRoutes, {
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
    rateLimitMax: env.RATE_LIMIT_MAX,
  });
  app.register(movementRoutes);
  app.register(productRoutes);
  app.register(saleRoutes);
  app.register(userRoutes);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}