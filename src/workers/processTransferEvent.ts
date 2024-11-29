import { Queue, Worker } from "bullmq";
import { redisQueueConnection } from "./redisSetup";
import { transfers } from "../../ponder.schema";

export const processTransferQueue = new Queue<typeof transfers.$inferSelect>("processTransferQueue", {
    connection: redisQueueConnection
});

export const processTransferWorker = new Worker<typeof transfers.$inferSelect>("processTransferQueue", async (job) => {

    // find the associated payment intent that matches from, to, amount, token, and chainId
    // if it exists, update the payment intent with the transaction hash
    // there might be multiple payment intents that match the criteria, so we should update the oldest one

    

}, {
    connection: redisQueueConnection
});