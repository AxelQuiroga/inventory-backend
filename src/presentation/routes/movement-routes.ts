import type { FastifyInstance } from 'fastify';
import { MovementController } from '../controllers/movement-controller';
import { DrizzleMovementRepository } from '../../infrastructure/repositories/movement-repository';
import { RegisterStockEntry } from '../../application/movements/register-entry';
import { RegisterStockExit } from '../../application/movements/register-exit';
import { GetMovementHistory } from '../../application/movements/get-history';

export async function movementRoutes(app: FastifyInstance) {
  const repository = new DrizzleMovementRepository();
  const registerEntry = new RegisterStockEntry(repository);
  const registerExit = new RegisterStockExit(repository);
  const getHistory = new GetMovementHistory(repository);

  const controller = new MovementController(registerEntry, registerExit, getHistory);

  app.post('/movements/entry', controller.createEntry.bind(controller));
  app.post('/movements/exit', controller.createExit.bind(controller));
  app.get('/movements/history/:productId', controller.getHistory.bind(controller));
}