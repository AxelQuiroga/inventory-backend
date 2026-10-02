import dotenv from 'dotenv';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { db } from './infrastructure/database';

dotenv.config();

const env = loadEnv();

// El probe /health consulta la base de verdad: si la DB está caída o expiró,
// responde 503 en vez de "ok" (zombie healthy en Render).
const app = buildApp(env, {
    checkDb: async () => {
        await db.$client.query('SELECT 1');
    },
});

const start = async () => {
    try {
        await app.listen({ port: env.PORT, host: '0.0.0.0' });
        console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();
