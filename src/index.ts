import dotenv from 'dotenv';
import { buildApp } from './app';
import { loadEnv } from './config/env';

dotenv.config();

const env = loadEnv();

const app = buildApp(env);

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