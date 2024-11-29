import { Queue, Worker } from "bullmq";
import { redisQueueConnection } from "./redisSetup";
import type { transfers } from "../../ponder.schema";

export const processTransferQueue = new Queue<typeof transfers.$inferSelect>(
	"processTransferQueue",
	{
		connection: redisQueueConnection,
	},
);

// export const processTransferWorker = new Worker<typeof transfers.$inferSelect>(
// 	"processTransferQueue",
// 	async (job) => {
// 		console.log(job.data);
// 		// Do something with the data
// 		return job.data;
// 	},
// 	{
// 		connection: redisQueueConnection,
// 	},
// );
