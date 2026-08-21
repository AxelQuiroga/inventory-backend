import type { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterStockEntry } from '../../application/movements/register-entry';
import { RegisterStockExit } from '../../application/movements/register-exit';
import { GetMovementHistory } from '../../application/movements/get-history';
import { registerMovementSchema } from '../schemas/movement-schema';

export class MovementController {
  constructor(
    private registerEntryUseCase: RegisterStockEntry,
    private registerExitUseCase: RegisterStockExit,
    private getHistoryUseCase: GetMovementHistory,
  ) {}

  async createEntry(request: FastifyRequest, reply: FastifyReply) {
    const parsed = registerMovementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      const user = request.user as { userId: string };
const movement = await this.registerEntryUseCase.execute({
  ...parsed.data,
  userId: user.userId,
});
      return reply.status(201).send(movement);
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found') {
        return reply.status(404).send({ message: 'Product not found' });
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async createExit(request: FastifyRequest, reply: FastifyReply) {
    const parsed = registerMovementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
    }

    try {
      const user = request.user as { userId: string };
const movement = await this.registerEntryUseCase.execute({
  ...parsed.data,
  userId: user.userId,
});
      return reply.status(201).send(movement);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Product not found') {
          return reply.status(404).send({ message: 'Product not found' });
        }
        if (error.message === 'Insufficient stock') {
          return reply.status(400).send({ message: 'Insufficient stock' });
        }
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const { productId } = request.params as { productId: string };

    try {
      const history = await this.getHistoryUseCase.execute(productId);
      return reply.send(history);
    } catch (error) {
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }
}