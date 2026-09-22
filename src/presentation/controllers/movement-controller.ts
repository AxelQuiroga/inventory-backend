import type { FastifyRequest, FastifyReply } from 'fastify';
import { RegisterStockEntry } from '../../application/movements/register-entry';
import { RegisterStockExit } from '../../application/movements/register-exit';
import { GetMovementHistory } from '../../application/movements/get-history';
import { GetMovements } from '../../application/movements/get-movements';
import {
  registerMovementSchema,
  movementParamsSchema,
  movementHistoryQuerySchema,
  movementsQuerySchema,
} from '../schemas/movement-schema';

export class MovementController {
  constructor(
    private registerEntryUseCase: RegisterStockEntry,
    private registerExitUseCase: RegisterStockExit,
    private getHistoryUseCase: GetMovementHistory,
    private getMovementsUseCase: GetMovements,
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
      if (error instanceof Error) {
        if (error.message === 'Product not found') {
          return reply.status(404).send({ message: 'Product not found' });
        }
        if (error.message === 'Product is inactive') {
          return reply.status(400).send({ message: 'Product is inactive' });
        }
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
      const movement = await this.registerExitUseCase.execute({
        ...parsed.data,
        userId: user.userId,
      });
      return reply.status(201).send(movement);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Product not found') {
          return reply.status(404).send({ message: 'Product not found' });
        }
        if (error.message === 'Product is inactive') {
          return reply.status(400).send({ message: 'Product is inactive' });
        }
        if (error.message === 'Insufficient stock') {
          return reply.status(400).send({ message: 'Insufficient stock' });
        }
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const params = movementParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: 'Invalid params', errors: params.error.flatten() });
    }
    const query = movementHistoryQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({ message: 'Invalid query', errors: query.error.flatten() });
    }
    const { productId } = params.data;

    try {
      const history = await this.getHistoryUseCase.execute(productId, query.data);
      return reply.send(history);
    } catch (error) {
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async getMovements(request: FastifyRequest, reply: FastifyReply) {
    const query = movementsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({ message: 'Invalid query', errors: query.error.flatten() });
    }

    try {
      // El role sale del JWT verificado por authenticate (nunca del query).
      const user = request.user as { userId: string; role: string };
      const movements = await this.getMovementsUseCase.execute({ ...query.data, role: user.role });
      return reply.send(movements);
    } catch (error) {
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }
}