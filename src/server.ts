import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { db } from './db'; // Connection to your Ponder database
import { Address, verifyMessage } from 'viem';

// Types based on your schema
type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

interface PaymentIntent {
  id: string;
  status: PaymentStatus;
  extId: string;
  from: Address;
  to: Address;
  timestamp: bigint;
  amount: bigint;
  token: Address;
  chainId: string;
}

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
  createAt: Date;
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
    secret: process.env.JWT_SECRET!
  });

  // Auth decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const merchant = await db.merchant.findUnique({
        where: { id: (request.user as { merchantId: string }).merchantId }
      });
      if (!merchant) throw new Error('Merchant not found');
      request.merchant = merchant;
    } catch (err) {
      reply.status(401).send({ error: 'Authentication failed' });
    }
  });

  // Create merchant account
  fastify.post<{ Body: CreateMerchantBody }>('/merchants', async (request, reply) => {
    const { name, address, webhookUrl, signature } = request.body;

    try {
      // Verify signature
      const message = `Register merchant account for ${address} with name ${name}`;
      const isAddressValid = await verifyMessage({message, signature, address});
      
      if (!isAddressValid) {
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      const merchant = await db.merchant.create({
        data: {
          id: crypto.randomUUID(),
          name,
          address: address.toLowerCase(),
          webhookUrl,
        }
      });

      const token = await reply.jwtSign({ merchantId: merchant.id });
      return { merchant, token };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create merchant account' });
    }
  });

  // Create payment intent
  fastify.post<{ Body: CreatePaymentIntentBody }>('/payment-intents', async (request, reply) => {
    const { from, to, amount, token, chainId, extId, signature } = request.body;

    try {
      // Verify signature
      const message = `Create payment intent: to=${to} amount=${amount} token=${token} chainId=${chainId} extId=${extId}`;
      const isAddressValid = verifyMessage({message, signature, address: from});
      
      if (!isAddressValid) {
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      // Check for existing pending payment
      const existingPayment = await db.paymentIntents.findFirst({
        where: {
          from: from.toLowerCase(),
          status: 'pending'
        }
      });

      if (existingPayment) {
        return reply.status(400).send({ error: 'Existing pending payment found' });
      }

      const paymentIntent = await db.paymentIntents.create({
        data: {
          id: crypto.randomUUID(),
          extId,
          from: from.toLowerCase(),
          to: to.toLowerCase(),
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          amount: BigInt(amount),
          token: token.toLowerCase(),
          chainId,
          status: 'pending'
        }
      });

      return { paymentIntent };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create payment intent' });
    }
  });

  // Cancel payment intent
  fastify.post<{
    Params: { id: string };
    Body: CancelPaymentIntentBody;
  }>('/payment-intents/:id/cancel', async (request, reply) => {
    const { id } = request.params;
    const { from, signature } = request.body;

    try {
      const paymentIntent = await db.paymentIntents.findUnique({ where: { id } });
      if (!paymentIntent) {
        return reply.status(404).send({ error: 'Payment intent not found' });
      }

      if (paymentIntent.from.toLowerCase() !== from.toLowerCase()) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      // Verify signature
      const message = `Cancel payment intent ${id}`;
      const isAddressValid = verifyMessage({message, signature, address: from});
      
      if (!isAddressValid) {
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      const updatedIntent = await db.paymentIntents.update({
        where: { id },
        data: { status: 'cancelled' }
      });

      return { paymentIntent: updatedIntent };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to cancel payment intent' });
    }
  });

  // Get merchant payments
  fastify.get('/payments', {
    onRequest: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const payments = await db.paymentIntents.findMany({
        where: { to: request.merchant.address }
      });
      return { payments };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch payments' });
    }
  });
}

// Transfer processing function
export async function processTransfer(transfer: Transfer) {
  try {
    // Store transfer
    await db.transfers.create({
      data: {
        hash: transfer.hash,
        from: transfer.from.toLowerCase(),
        to: transfer.to.toLowerCase(),
        timestamp: transfer.timestamp,
        amount: transfer.amount,
        token: transfer.token.toLowerCase(),
        chainId: transfer.chainId
      }
    });

    // Find matching payment intent
    const matchingIntent = await db.paymentIntents.findFirst({
      where: {
        status: 'pending',
        from: transfer.from.toLowerCase(),
        to: transfer.to.toLowerCase(),
        token: transfer.token.toLowerCase(),
        chainId: transfer.chainId,
        amount: transfer.amount
      }
    });

    if (!matchingIntent) return;

    // Update payment intent
    const updatedIntent = await db.paymentIntents.update({
      where: { id: matchingIntent.id },
      data: { status: 'completed' }
    });

    // Fetch merchant details
    const merchant = await db.merchant.findFirst({
      where: { address: transfer.to.toLowerCase() }
    });

    if (!merchant) return;

    // Send webhook
    await fetch(merchant.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'payment.completed',
        data: {
          paymentIntent: updatedIntent,
          transfer: {
            hash: transfer.hash,
            timestamp: transfer.timestamp
          }
        }
      })
    });
  } catch (error) {
    console.error('Failed to process transfer:', error);
  }
}