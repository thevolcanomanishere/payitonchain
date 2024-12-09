import Fastify, {
	type FastifyInstance,
	type FastifyReply,
	type FastifyRequest,
} from "fastify";
import fastifyJwt from "@fastify/jwt";
import {
	cancelPaymentIntent,
	checkForOutstandingPaymentIntent,
	createPaymentIntent,
	db,
	getMerchantPaymentsPaginated,
	getPaymentIntent,
} from "../src/db"; // Connection to your Ponder database
import { type Address, getAddress, isAddressEqual, verifyMessage } from "viem";
import { createMerchant } from "../src/db";
import { differenceInHours } from "date-fns";
import fastifyCors from "@fastify/cors";
import FastifySSEPlugin from "fastify-sse-v2";
import { QueueEvents } from "bullmq";
import { redisQueueConnection } from "../workers/redisSetup";
import type { payment_intent } from "@prisma/client";

declare module "fastify" {
	interface FastifyRequest {
		merchant?: Merchant;
		client?: { address: Address };
	}
	interface FastifyInstance {
		authenticateMerchant: (
			request: FastifyRequest,
			reply: FastifyReply,
		) => Promise<void>;
		authenticateClient: (
			request: FastifyRequest,
			reply: FastifyReply,
		) => Promise<void>;
	}
}

// Types based on your schema
type PaymentStatus = "pending" | "completed" | "failed" | "cancelled";

interface Transfer {
	hash: Address;
	from: Address;
	to: Address;
	timestamp: bigint;
	amount: bigint;
	token: Address;
	chainId: string;
}

interface Merchant {
	id: string;
	name: string;
	address: string;
	webhookUrl: string;
	createdAt: Date;
}

// Request type definitions
interface CreateMerchantBody {
	name: string;
	address: Address;
	webhookUrl: string;
	nonce: string;
	signature: Address;
	chainIds: number[];
}

interface CreatePaymentIntentBody {
	from: Address;
	to: Address;
	amount: number;
	token: Address;
	chainId: number;
	extId: string;
	merchantId: string;
	signature: Address;
}

interface CancelPaymentIntentBody {
	from: Address;
	signature: Address;
}

const clientSSEMap = new Map<Address, FastifyReply>();

const qEvents = new QueueEvents("fireWebhookQueue", {
	connection: redisQueueConnection,
});

qEvents.on("completed", async (jobId) => {
	const jobData = jobId.returnvalue as unknown as payment_intent;
	console.log(`Job completed: ${jobData.id}`);
	console.table(jobData);
	const { from } = jobData;

	const client = clientSSEMap.get(from as Address);

	if (client) {
		client.sse({
			event: "update",
			data: JSON.stringify(jobData),
		});
	}
});

// Fastify plugin
export default async function paymentApi(fastify: FastifyInstance) {
	// JWT setup
	await fastify.register(fastifyJwt, {
		secret: "dasecretpasswordbombaclat",
		// cookie: {
		// 	cookieName: "token",
		// 	signed: false
		// }
	});

	// await fastify.register(fastifyCookie, {
	// 	secret: "dasecretpasswordbombaclat",

	// })

	await fastify.register(fastifyCors, {
		origin: "*",
	});

	await fastify.register(FastifySSEPlugin);

	// Auth decorator
	fastify.decorate(
		"authenticateMerchant",
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				console.log(`Authenticate: ${JSON.stringify(request.headers)}`);
				await request.jwtVerify();
				const merchant = await db.merchant.findUnique({
					where: { id: (request.user as { merchantId: string }).merchantId },
				});

				console.log(`Merchant: ${JSON.stringify(merchant)}`);
				if (!merchant) throw new Error("Merchant not found");
				request.merchant = merchant;
			} catch (err) {
				await reply.status(401).send({ error: "Authentication failed" });
			}
		},
	);

	fastify.decorate(
		"authenticateClient",
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				console.log(`Authenticate: ${JSON.stringify(request.headers)}`);
				await request.jwtVerify();
				request.client = { address: request.user as Address };
			} catch (err) {
				await reply.status(401).send({ error: "Authentication failed" });
			}
		},
	);

	/**
	 * Generate a nonce, store it.
	 */
	fastify.get("/nonce", {}, async (request, reply) => {
		const record = await db.nonce.create({
			data: {
				nonce: crypto.randomUUID(),
			},
		});

		console.log(`Nonce: ${record.nonce}`);

		return { nonce: record.nonce };
	});

	fastify.post<{
		Body: {
			address: Address;
			signature: Address;
			nonce: string;
		};
	}>("/merchants/login", {}, async (request, reply) => {
		const { address, signature, nonce } = request.body;

		const message = `Login merchant for address ${address} with nonce ${nonce}`;
		const isAddressValid = await verifyMessage({
			message,
			signature,
			address,
		});

		if (!isAddressValid) {
			return reply.status(400).send({ error: "Invalid signature" });
		}

		const merchant = await db.merchant.findUnique({
			where: { address: getAddress(address) },
		});

		if (!merchant) {
			return reply.status(404).send({ error: "Merchant not found" });
		}

		await db.nonce.update({
			where: {
				nonce,
			},
			data: {
				used: new Date(),
			},
		});

		const token = await reply.jwtSign({ merchantId: merchant.id });
		return { merchant, token };
	});

	fastify.post<{ Body: CreateMerchantBody }>(
		"/merchants/signup",
		{},
		async (request, reply) => {
			const { name, address, webhookUrl, signature, nonce, chainIds } =
				request.body;

			try {
				// Check if nonce exists
				const nonceRecord = await db.nonce.findUnique({
					where: {
						nonce,
					},
				});

				if (!nonceRecord) {
					return reply.status(400).send({ error: "Invalid nonce" });
				}

				console.table(nonceRecord);

				if (differenceInHours(new Date(), nonceRecord.createdAt) > 1) {
					return reply.status(400).send({ error: "Nonce expired" });
				}

				// Verify signature
				const message = `Register merchant account for ${address} with name ${name} and unique key: ${nonce}`;
				console.log(`Message: ${message}`);
				const isAddressValid = await verifyMessage({
					message,
					signature,
					address,
				});

				if (!isAddressValid) {
					return reply.status(400).send({ error: "Invalid signature" });
				}

				if (!webhookUrl.includes("http")) {
					return reply.status(400).send({ error: "Invalid webhook URL" });
				}

				const merchant = await createMerchant({
					name,
					address,
					webhookUrl,
					chainIds,
				});

				console.table(merchant);

				const token = await reply.jwtSign({ merchantId: merchant.id });
				return { merchant, token };
			} catch (error) {
				return reply
					.status(500)
					.send({ error: "Failed to create merchant account" });
			}
		},
	);

	// Create payment intent
	fastify.post<{ Body: CreatePaymentIntentBody }>(
		"/payment-intents",
		{},
		async (request, reply) => {
			const { from, to, amount, token, chainId, extId, merchantId, signature } =
				request.body;

			console.log("/payment-intents: ");
			console.table(request.body);

			try {
				// Verify signature
				const message = `Create payment intent: to=${to} amount=${amount} token=${token} chainId=${chainId} extId=${extId}`;
				console.log(`Message: ${message}`);
				const isAddressValid = verifyMessage({
					message,
					signature,
					address: from,
				});

				if (!isAddressValid) {
					return reply.status(400).send({ error: "Invalid signature" });
				}

				// Check for existing pending payment
				const existingPayment = await checkForOutstandingPaymentIntent({
					from,
					to,
					amount,
					chainId,
					token,
				});

				console.table(existingPayment);

				if (existingPayment) {
					return reply
						.status(400)
						.send({ error: "Existing pending payment found" });
				}

				const paymentIntent = await createPaymentIntent({
					from,
					to,
					amount,
					token,
					chainId,
					extId,
					merchantId,
				});

				console.log("Payment intent: ");
				console.table(paymentIntent);

				return { paymentIntent };
			} catch (error) {
				return reply
					.status(500)
					.send({ error: "Failed to create payment intent" });
			}
		},
	);

	// Cancel payment intent
	fastify.post<{
		Params: { id: string };
		Body: CancelPaymentIntentBody;
	}>("/payment-intents/:id/cancel", {}, async (request, reply) => {
		const { id } = request.params;
		const { from, signature } = request.body;

		try {
			const paymentIntent = await getPaymentIntent(id);
			if (!paymentIntent) {
				return reply.status(404).send({ error: "Payment intent not found" });
			}

			if (!isAddressEqual(paymentIntent.from as Address, from)) {
				return reply.status(403).send({ error: "Unauthorized" });
			}

			// Verify signature
			const message = `Cancel payment intent ${id}`;
			const isAddressValid = verifyMessage({
				message,
				signature,
				address: from,
			});

			if (!isAddressValid) {
				return reply.status(400).send({ error: "Invalid signature" });
			}

			const updatedIntent = await cancelPaymentIntent(id);

			return { paymentIntent: updatedIntent };
		} catch (error) {
			return reply
				.status(500)
				.send({ error: "Failed to cancel payment intent" });
		}
	});

	fastify.get<{
		Params: {
			address: Address;
		};
	}>("/client/payments/:address", {}, async (request, reply) => {
		const { address } = request.params;

		return db.payment_intent.findMany({
			where: {
				from: getAddress(address),
			},
		});
	});

	fastify.post<{
		Body: {
			address: Address;
			signature: Address;
			nonce: string;
		};
	}>("/client/login", {}, async (request, reply) => {
		const { address, signature, nonce } = request.body;

		const message = `Login for address ${address} with nonce ${nonce}`;
		const isAddressValid = await verifyMessage({
			message,
			signature,
			address,
		});

		if (!isAddressValid) {
			return reply.status(400).send({ error: "Invalid signature" });
		}

		await db.nonce.update({
			where: {
				nonce,
			},
			data: {
				used: new Date(),
			},
		});

		const token = await reply.jwtSign({ address });
		return { token };
	});

	fastify.get<{
		Params: {
			address: Address;
		};
	}>("/client/payments/updates/:address", {}, async (request, reply) => {
		const { address } = request.params;

		request.raw.on("close", () => {
			console.log(`Total clients: ${clientSSEMap.size}`);
			clientSSEMap.delete(address);
		});

		const allPayments = await db.payment_intent.findMany({
			where: {
				from: getAddress(address),
			},
		});

		reply.sse({
			event: "connect",
			data: JSON.stringify(allPayments),
		});

		clientSSEMap.set(getAddress(address), reply);
		console.log(`Total clients: ${clientSSEMap.size}`);
	});

	// Get merchant payments
	fastify.get(
		"/payments",
		{
			onRequest: [fastify.authenticateMerchant],
		},
		async (request, reply) => {
			try {
				if (request.merchant === undefined) {
					return reply.status(500).send({ error: "Failed to fetch payments" });
				}
				const payments = await getMerchantPaymentsPaginated({
					merchantId: request.merchant.id,
				});
				return payments;
			} catch (error) {
				return reply.status(500).send({ error: "Failed to fetch payments" });
			}
		},
	);
}
