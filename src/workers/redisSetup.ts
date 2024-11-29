import Redis from "ioredis";

if(!process.env.REDIS_URL) {
    throw new Error("REDIS_URL not set");
}

export const redisQueueConnection = new Redis(process.env.REDIS_URL);