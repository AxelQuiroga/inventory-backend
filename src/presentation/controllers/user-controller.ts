import type { FastifyRequest, FastifyReply } from 'fastify';
import { ListUsers } from '../../application/users/list-users';
import { DeactivateUser } from '../../application/users/deactivate-user';
import { ReactivateUser } from '../../application/users/reactivate-user';
import { userParamsSchema } from '../schemas/user-schema';

export class UserController {
  constructor(
    private listUsersUseCase: ListUsers,
    private deactivateUserUseCase: DeactivateUser,
    private reactivateUserUseCase: ReactivateUser,
  ) {}

  async list(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const users = await this.listUsersUseCase.execute();
      return reply.send(users);
    } catch (error) {
      return this.handleError(error, reply, _request);
    }
  }

  async deactivate(request: FastifyRequest, reply: FastifyReply) {
    const params = userParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }

    try {
      const user = await this.deactivateUserUseCase.execute(params.data.id);
      return reply.send(user);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  async reactivate(request: FastifyRequest, reply: FastifyReply) {
    const params = userParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }

    try {
      const user = await this.reactivateUserUseCase.execute(params.data.id);
      return reply.send(user);
    } catch (error) {
      return this.handleError(error, reply, request);
    }
  }

  private handleError(error: unknown, reply: FastifyReply, request: FastifyRequest) {
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        return reply.status(404).send({ message: 'User not found' });
      }
      if (error.message === 'Cannot manage ADMIN user') {
        return reply.status(400).send({ message: 'Cannot manage ADMIN user' });
      }
    }
    request.log.error({ error }, 'Unexpected error in user controller');
    return reply.status(500).send({ message: 'Internal server error' });
  }
}