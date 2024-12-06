import { Queue, Worker } from "bullmq";
import type { transfers } from "../ponder.schema";
import { db, matchTransferToPaymentIntent, setupDb } from "../src/db";
import { type payment_intent, PaymentIntentStatus } from "@prisma/client";
import { redisQueueConnection } from "./redisSetup";
import axios from "axios";
import { toReadableNumber } from "../utils/numbers";

export const fireWebhookQueue = new Queue("fireWebhookQueue", {
	connection: redisQueueConnection,
});

type TransferType = Omit<typeof transfers.$inferSelect, "amount"> & {
	amount: string;
};

export const processTransferQueueWorker = new Worker<TransferType>(
	"processTransferQueue",
	async (job) => {
		const { from, to, amount, chainId, token, hash } = job.data;

		console.table(job.data);

		await db.$transaction(async (prismaInstance) => {
			const amountConverted = toReadableNumber(amount, token);
			console.log(`Converted amount ${amount} to ${amountConverted}`);
			const paymentIntent = await matchTransferToPaymentIntent({
				from,
				to,
				amount: amountConverted,
				token,
				chainId,
				prismaInstance,
			});

			if (!paymentIntent) {
				console.log(`No payment intent found for transfer ${hash}`);
				return `No payment intent found for transfer ${hash}`;
			}

			console.log(
				`Matched transfer ${hash} to payment intent ${paymentIntent.id}`,
			);

			const updatedPaymentIntent = await prismaInstance.payment_intent.update({
				where: {
					id: paymentIntent.id,
				},
				data: {
					status: PaymentIntentStatus.COMPLETE,
				},
			});

			console.log(
				`Updated payment intent ${updatedPaymentIntent.id} to status ${updatedPaymentIntent.status}`,
			);

			await fireWebhookQueue.add("fireWebhook", updatedPaymentIntent);
		});
	},
	{
		connection: redisQueueConnection,
	},
);

export const fireWebhookQueueWorker = new Worker<payment_intent>(
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

		return job.data;
	},
	{
		connection: redisQueueConnection,
	},
);
