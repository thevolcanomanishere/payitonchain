import { PaymentIntentStatus, type Prisma, PrismaClient } from "@prisma/client";
import type { Address } from "viem";

export let db: PrismaClient;
export const setupDb = async () => {
	return new Promise((resolve) => {
		db = new PrismaClient({
			log: [
				{
					emit: "event",
					level: "query",
				},
				{
					emit: "stdout",
					level: "error",
				},
				{
					emit: "stdout",
					level: "info",
				},
				{
					emit: "stdout",
					level: "warn",
				},
			],
		});

		resolve(db);
	});
};

export const createMerchant = async ({
	name,
	address,
	webhookUrl,
}: { name: string; address: Address; webhookUrl: string }) => {
	return await db.merchant.create({
		data: {
			name,
			address,
			webhookUrl,
		},
	});
};

export const checkForOutstandingPaymentIntent = async ({
	from,
	to,
	amount,
	token,
	chainId,
}: {
	from: Address;
	to: Address;
	amount: bigint;
	token: Address;
	chainId: string;
}) => {
    return await db.payment_intent.findUnique({
        where: {
            from_to_amount_token_chainId_status: {
                from,
                to,
                amount,
                token,
                chainId,
                status: PaymentIntentStatus.PENDING,
            }
        }
    })
};

export const createPaymentIntent = async ({
	from,
	to,
	amount,
	token,
	chainId,
	extId,
	merchantId
}: {
	from: Address;
	to: Address;
	amount: bigint;
	token: Address;
	chainId: string;
	extId: string;
	merchantId: string;
}) => {
	return await db.payment_intent.create({
		data: {
			from,
			to,
			amount,
			token,
			chainId,
			status: PaymentIntentStatus.PENDING,
			extId,
			merchantId
		},
	});
};


export const getPaymentIntent = async (id: string) => {
    return await db.payment_intent.findUnique({
        where: { id },
    });
}

export const cancelPaymentIntent = async (id: string) => {
    return await db.payment_intent.update({
        where: { id },
        data: { status: PaymentIntentStatus.CANCELLED },
    });
}

export const matchTransferToPaymentIntent = async ({
	from, 
	to,
	amount,
	token, 
	chainId,
	prismaInstance,
} : {
	from: Address;
	to: Address;
	amount: bigint;
	token: Address;
	chainId: string;
	prismaInstance: Prisma.TransactionClient;
}) => {
	return await db.payment_intent.findUnique({
		where: {
			from_to_amount_token_chainId_status: {
				from,
				to,
				amount,
				token,
				chainId,
				status: PaymentIntentStatus.PENDING,
			}
		}
	});
}

export const getMerchantPaymentsPaginated = async ({
    merchantId,
    // page,
    // perPage,
}: {
    merchantId: string;
    // page: number;
    // perPage: number;
}) => {
    return await db.payment_intent.findMany({
        where: { id: merchantId },
        // take: perPage,
        // skip: page * perPage,
    });
}