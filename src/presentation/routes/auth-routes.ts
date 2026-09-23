import type { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth-controller';
import { DrizzleUserRepository } from '../../infrastructure/repositories/user-repository';
import { Login } from '../../application/auth/login';
import { Register } from '../../application/auth/register';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export interface AuthRoutesOptions {
  rateLimitEnabled: boolean;
  rateLimitMax: number;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions) {
  const userRepository = new DrizzleUserRepository();
  const jwtService = app.jwtService;

  const loginUseCase = new Login(userRepository, jwtService);
  const registerUseCase = new Register(userRepository);

  const controller = new AuthController(loginUseCase, registerUseCase);

  app.post(
    '/auth/login',
    {
      // Rate limit por IP sobre el ÚNICO endpoint público con bcrypt (cost 12):
      // corta la fuerza bruta sobre credenciales. El plugin se registra en
      // app.ts con global:false; si el env lo desactiva (tests e2e), la opción
      // no se aplica — fastify ignora config de rutas sin plugin.
      config: opts.rateLimitEnabled
        ? { rateLimit: { max: opts.rateLimitMax, timeWindow: '15 minutes' } }
        : undefined,
    },
    controller.login.bind(controller),
  );
  app.post('/auth/register', {
    preHandler: [authenticate, authorize('ADMIN')],
  }, controller.register.bind(controller));
}