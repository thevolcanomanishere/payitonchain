import { Queue } from "bullmq";
import { redisQueueConnection } from "./redisSetup";
import type { transfers } from "../ponder.schema";

export const processTransferQueue = new Queue<typeof transfers.$inferSelect>(
	"processTransferQueue",
	{
		connection: redisQueueConnection,
	},
);



