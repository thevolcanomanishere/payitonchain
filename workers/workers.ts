import { Queue, Worker } from "bullmq";
import type { transfers } from "../ponder.schema";
import { db, matchTransferToPaymentIntent, setupDb } from "../src/db";
import { PaymentIntentStatus } from "@prisma/client";
import { redisQueueConnection } from "./redisSetup";
import axios from "axios";


export const fireWebhookQueue = new Queue("fireWebhookQueue", {
	connection: redisQueueConnection,
});

type TransferType = Omit<typeof transfers.$inferSelect, "amount"> & {amount: string};

export const processTransferQueueWorker = new Worker<TransferType>(
	"processTransferQueue",
	async (job) => {
		const { from, to, amount, chainId, token, hash } = job.data;

		console.table(job.data)

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

			console.log(`Matched transfer ${hash} to payment intent ${paymentIntent.id}`);

			const updatedPaymentIntent = await prismaInstance.payment_intent.update({
				where: {
					id: paymentIntent.id,
				},
				data: {
					status: PaymentIntentStatus.COMPLETE,
				},
			});

			console.log(`Updated payment intent ${updatedPaymentIntent.id} to status ${updatedPaymentIntent.status}`);

			await fireWebhookQueue.add("fireWebhook", updatedPaymentIntent);
		});
	},
	{
		connection: redisQueueConnection,
	},
);



export const fireWebhookQueueWorker = new Worker(
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

		console.log(`Firing webhook for merchant ${merchant.id}`);

		const { webhookUrl } = merchant;

		await axios.post(webhookUrl, job.data);
	},
	{
		connection: redisQueueConnection,
	},
);
