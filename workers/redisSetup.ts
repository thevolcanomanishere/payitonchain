import Redis from "ioredis";

if(!process.env.REDIS_URL) {
    throw new Error("REDIS_URL not set");
}

console.log("Connecting to Redis at", process.env.REDIS_URL);

export const redisQueueConnection = new Redis(process.env.REDIS_URL);