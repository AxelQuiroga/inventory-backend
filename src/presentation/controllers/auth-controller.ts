import type { FastifyRequest, FastifyReply } from 'fastify';
import { Login } from '../../application/auth/login';
import { Register } from '../../application/auth/register';
import {
  InvalidCredentialsError,
  AccountDeactivatedError,
  EmailAlreadyRegisteredError,
} from '../../domain/auth-errors';
import { loginSchema, registerSchema } from '../schemas/auth-schema';

export class AuthController {
  constructor(
    private loginUseCase: Login,
    private registerUseCase: Register,
  ) {}

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
      }

      const token = await this.loginUseCase.execute(parsed.data.email, parsed.data.password);
      return reply.send({ token });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }
      if (error instanceof AccountDeactivatedError) {
        return reply.status(401).send({ message: 'User is deactivated' });
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
      }

      const user = await this.registerUseCase.execute(parsed.data);
      return reply.status(201).send(user);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        return reply.status(409).send({ message: 'Email already registered' });
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }
}