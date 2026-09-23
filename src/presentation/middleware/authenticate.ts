import type { FastifyRequest, FastifyReply } from 'fastify';

// Autenticación con UNA sola lib (jsonwebtoken) vía el JwtService decorado en
// la instancia. Antes esto usaba request.jwtVerify() de @fastify/jwt: dos libs
// firmando/verificando el mismo contrato era deuda y superficie de bug.
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new Error('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);
    request.user = request.server.jwtService.verify(token);
  } catch {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
}