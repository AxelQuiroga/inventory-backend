import dotenv from 'dotenv';
import { buildApp } from './app';

dotenv.config();

const app = buildApp();

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