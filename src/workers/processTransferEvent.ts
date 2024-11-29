import { Queue, Worker } from "bullmq";
import { redisQueueConnection } from "./redisSetup";
import type { transfers } from "../../ponder.schema";
import { db, matchTransferToPaymentIntent } from "../db";
import axios from "axios";
import { PaymentIntentStatus } from "@prisma/client";

export const processTransferQueue = new Queue<typeof transfers.$inferSelect>(
	"processTransferQueue",
	{
		connection: redisQueueConnection,
	},
);

export const processTransferWorker = new Worker<typeof transfers.$inferSelect>(
	"processTransferQueue",
	async (job) => {
		const { from, to, amount, chainId, token, hash, timestamp } = job.data;

		await db.$transaction(async (prismaInstance) => {
			const paymentIntent = await matchTransferToPaymentIntent({
				from,
				to,
				amount,
				token,
				chainId,
				prismaInstance,
			});

			if (!paymentIntent) {
				return `No payment intent found for transfer ${hash}`;
			}

			const updatedPaymentIntent = await prismaInstance.payment_intent.update({
				where: {
					id: paymentIntent.id,
				},
				data: {
					status: PaymentIntentStatus.COMPLETE,
				},
			});

			await fireWebhookQueue.add("fireWebhook", updatedPaymentIntent);
		});
	},
	{
		connection: redisQueueConnection,
	},
);

export const fireWebhookQueue = new Queue("fireWebhookQueue", {
	connection: redisQueueConnection,
});

export const fireWebhookWorker = new Worker(
	"fireWebhookQueue",
	async (job) => {
		const merchant = await db.merchant.findUnique({
			where: {
				id: job.data.merchantId,
			},
		});

		if (!merchant) {
			return `Merchant not found for payment intent ${job.data.id}`;
		}

		const { webhookUrl } = merchant;

		await axios.post(webhookUrl, job.data);
	},
	{
		connection: redisQueueConnection,
	},
);
