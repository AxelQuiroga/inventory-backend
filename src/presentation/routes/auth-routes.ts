import type { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth-controller';
import { DrizzleUserRepository } from '../../infrastructure/repositories/user-repository';
import { JwtService } from '../../infrastructure/auth/jwt-service';
import { Login } from '../../application/auth/login';
import { Register } from '../../application/auth/register';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export async function authRoutes(app: FastifyInstance) {
  const userRepository = new DrizzleUserRepository();
  const jwtService = new JwtService(process.env.JWT_SECRET!);

  const loginUseCase = new Login(userRepository, jwtService);
  const registerUseCase = new Register(userRepository);

  const controller = new AuthController(loginUseCase, registerUseCase);

  app.post('/auth/login', controller.login.bind(controller));
  app.post('/auth/register', {
    preHandler: [authenticate, authorize('ADMIN')],
  }, controller.register.bind(controller));
}