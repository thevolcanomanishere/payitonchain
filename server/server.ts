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
import { type Address, verifyMessage } from "viem";
import { createMerchant } from "../src/db";
import { differenceInHours } from "date-fns";

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
	nonce: string;
	signature: Address;
}

interface CreatePaymentIntentBody {
	from: Address;
	to: Address;
	amount: string;
	token: Address;
	chainId: string;
	extId: string;
	merchantId: string;
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

				console.log(`Authenticate: ${JSON.stringify(request.headers)}`)
				await request.jwtVerify();
				const merchant = await db.merchant.findUnique({
					where: { id: (request.user as { merchantId: string }).merchantId },
				});

				console.log(`Merchant: ${JSON.stringify(merchant)}`)
				if (!merchant) throw new Error("Merchant not found");
				request.merchant = merchant;
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
			}
		})

		console.log(`Nonce: ${record.nonce}`)
		
		return record.nonce
	});

	fastify.post<{ Body: CreateMerchantBody }>(
		"/merchants",
		{},
		async (request, reply) => {
			const { name, address, webhookUrl, signature, nonce } = request.body;

			console.log("/merchants: ")
			console.table(request.body)

			try {

				// Check if nonce exists
				const nonceRecord = await db.nonce.findUnique({
					where: {
						nonce,
					}
				});

				if (!nonceRecord) {
					return reply.status(400).send({ error: "Invalid nonce" });
				}

				console.table(nonceRecord)

				if(differenceInHours(new Date(), nonceRecord.createdAt) > 1) {
					return reply.status(400).send({ error: "Nonce expired" });
				}

				// Verify signature
				const message = `Register merchant account for ${address} with name ${name} and unique key: ${nonce}`;
				console.log(`Message: ${message}`)
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

				console.table(merchant)

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
			
			console.log("/payment-intents: ")
			console.table(request.body)

			try {
				// Verify signature
				const message = `Create payment intent: to=${to} amount=${amount} token=${token} chainId=${chainId} extId=${extId}`;
				console.log(`Message: ${message}`)
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
				
				console.table(existingPayment)

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
					merchantId
				});

				console.log("Payment intent: ")
				console.table(paymentIntent)

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
