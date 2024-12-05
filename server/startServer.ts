import Fastify from 'fastify';
import paymentApi from './server';
import { setupDb } from '../src/db';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

await setupDb();

async function start() {
  await fastify.register(paymentApi);
  
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

await start();