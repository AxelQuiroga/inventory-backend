import type { FastifyInstance } from 'fastify';
import { MovementController } from '../controllers/movement-controller';
import { DrizzleMovementRepository } from '../../infrastructure/repositories/movement-repository';
import { RegisterStockEntry } from '../../application/movements/register-entry';
import { RegisterStockExit } from '../../application/movements/register-exit';
import { GetMovementHistory } from '../../application/movements/get-history';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

export async function movementRoutes(app: FastifyInstance) {
  const repository = new DrizzleMovementRepository();
  const registerEntry = new RegisterStockEntry(repository);
  const registerExit = new RegisterStockExit(repository);
  const getHistory = new GetMovementHistory(repository);

  const controller = new MovementController(registerEntry, registerExit, getHistory);

  // Matriz de autorización: registrar movimientos = ADMIN + OPERATOR;
  // consultar historial = cualquier rol autenticado
  app.post('/movements/entry', { preHandler: [authenticate, authorize('ADMIN', 'OPERATOR')] }, controller.createEntry.bind(controller));
  app.post('/movements/exit', { preHandler: [authenticate, authorize('ADMIN', 'OPERATOR')] }, controller.createExit.bind(controller));
  app.get('/movements/history/:productId', { preHandler: [authenticate] }, controller.getHistory.bind(controller));
}