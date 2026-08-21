import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { productRoutes } from './presentation/routes/product-routes';
import { authRoutes } from './presentation/routes/auth-routes';
import { movementRoutes } from './presentation/routes/movement-routes';

dotenv.config();

const app = Fastify({
    logger: true,
});

app.register(cors);
app.register(jwt, { secret: process.env.JWT_SECRET! });

app.register(authRoutes);
app.register(movementRoutes);
app.register(productRoutes);

app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
    try {
        await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
        console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();