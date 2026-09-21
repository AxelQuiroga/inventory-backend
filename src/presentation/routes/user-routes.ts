import type { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/user-controller';
import { DrizzleUserRepository } from '../../infrastructure/repositories/user-repository';
import { ListUsers } from '../../application/users/list-users';
import { DeactivateUser } from '../../application/users/deactivate-user';
import { ReactivateUser } from '../../application/users/reactivate-user';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export async function userRoutes(app: FastifyInstance) {
  const repository = new DrizzleUserRepository();
  const listUsers = new ListUsers(repository);
  const deactivateUser = new DeactivateUser(repository);
  const reactivateUser = new ReactivateUser(repository);

  const controller = new UserController(listUsers, deactivateUser, reactivateUser);

  // Gestión de usuarios: exclusiva del ADMIN (USERS_POLICY.MD).
  // El ADMIN único no aparece en la lista y es intocable por estos endpoints.
  app.get('/users', { preHandler: [authenticate, authorize('ADMIN')] }, controller.list.bind(controller));
  app.post('/users/:id/deactivate', { preHandler: [authenticate, authorize('ADMIN')] }, controller.deactivate.bind(controller));
  app.post('/users/:id/reactivate', { preHandler: [authenticate, authorize('ADMIN')] }, controller.reactivate.bind(controller));
}