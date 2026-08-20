import type { FastifyRequest, FastifyReply } from 'fastify';

export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: string } | undefined;

    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({ message: 'Forbidden' });
    }
  };
}