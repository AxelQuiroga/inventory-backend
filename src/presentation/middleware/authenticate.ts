import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify();
    request.user = decoded;
  } catch (error) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
}