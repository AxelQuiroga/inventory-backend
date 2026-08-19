import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { db } from './infrastructure/database';
import { products } from './infrastructure/database/schema';

dotenv.config();

const app = Fastify({
    logger: true,
});

app.register(cors);

// Ruta de prueba - obtener productos
app.get('/products', async () => {
    const allProducts = await db.select().from(products);
    return allProducts;
});

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