import type { FastifyRequest, FastifyReply } from 'fastify';
import { Login } from '../../application/auth/login';
import { Register } from '../../application/auth/register';
import { ChangePassword } from '../../application/auth/change-password';
import {
  InvalidCredentialsError,
  AccountDeactivatedError,
  EmailAlreadyRegisteredError,
  CurrentPasswordMismatchError,
} from '../../domain/auth-errors';
import { loginSchema, registerSchema, changePasswordSchema } from '../schemas/auth-schema';

export class AuthController {
  constructor(
    private loginUseCase: Login,
    private registerUseCase: Register,
    private changePasswordUseCase: ChangePassword,
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

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid data', errors: parsed.error.flatten() });
      }

      // El preHandler authenticate ya validó el token y lo dejó en request.user.
      await this.changePasswordUseCase.execute(
        request.user.userId,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof CurrentPasswordMismatchError) {
        return reply.status(401).send({ message: 'Current password is incorrect' });
      }
      if (error instanceof InvalidCredentialsError) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }
      return reply.status(500).send({ message: 'Internal server error' });
    }
  }
}