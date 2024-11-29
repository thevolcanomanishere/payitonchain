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
} from "./db"; // Connection to your Ponder database
import { type Address, verifyMessage } from "viem";
import { createMerchant } from "./db";

declare module 'fastify' {
  interface FastifyRequest {
    merchant?: Merchant 
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
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
	signature: Address;
}

interface CreatePaymentIntentBody {
	from: Address;
	to: Address;
	amount: string;
	token: Address;
	chainId: string;
	extId: string;
	signature: Address;
}

interface CancelPaymentIntentBody {
	from: Address;
	signature: Address;
}

// Fastify plugin
export default async function paymentApi(fastify: FastifyInstance) {
	// JWT setup
	await fastify.register(fastifyJwt, {
		secret: "dasecretpasswordbombaclat",
	});

	// Auth decorator
	fastify.decorate(
		"authenticate",
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				await request.jwtVerify();
				const merchant = await db.merchant.findUnique({
					where: { id: (request.user as { merchantId: string }).merchantId },
				});
				if (!merchant) throw new Error("Merchant not found");
				request.merchant = merchant;
			} catch (err) {
				await reply.status(401).send({ error: "Authentication failed" });
			}
		},
	);

	// Create merchant account
	fastify.post<{ Body: CreateMerchantBody }>(
		"/merchants",
		{},
		async (request, reply) => {
			const { name, address, webhookUrl, signature } = request.body;

			try {
				// Verify signature
				const message = `Register merchant account for ${address} with name ${name}`;
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

				const merchant = await createMerchant({ name, address, webhookUrl });

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
			const { from, to, amount, token, chainId, extId, signature } =
				request.body;

			try {
				// Verify signature
				const message = `Create payment intent: to=${to} amount=${amount} token=${token} chainId=${chainId} extId=${extId}`;
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
					amount: BigInt(amount),
					chainId,
					token,
				});

				if (existingPayment) {
					return reply
						.status(400)
						.send({ error: "Existing pending payment found" });
				}

				const paymentIntent = await createPaymentIntent({
					from,
					to,
					amount: BigInt(amount),
					token,
					chainId,
					extId,
				});

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

			if (paymentIntent.from.toLowerCase() !== from.toLowerCase()) {
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

	// Get merchant payments
	fastify.get(
		"/payments",
		{
			onRequest: [fastify.authenticate],
		},
		async (request, reply) => {
			try {

        if(request.merchant === undefined) {
          return reply.status(500).send({ error: "Failed to fetch payments" });
        }
				const payments = await getMerchantPaymentsPaginated({
          merchantId: request.merchant.id,
        })
				return payments;
			} catch (error) {
				return reply.status(500).send({ error: "Failed to fetch payments" });
			}
		},
	);
}
