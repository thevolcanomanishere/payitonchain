import { ponder } from "@/generated";
import { transfers } from "../ponder.schema";
import { cache } from "./cache";
import { db } from "./db";
// import { processTransferQueue } from "./workers/processTransferEvent";

/**
 * Do we need to index events from this address
 */
const isAddressRelevant = async (address: string, chainId: string) => {
	const valid = await cache.getOrSet(`watching:${chainId}:${address}`, async () => {
		return db.merchant.findUnique({
			where: {
				address,
				chains: {
					has: chainId,
				},
			}
		})
	});
	return valid;
};

ponder.on("BENIS:Transfer", async ({ event, context }) => {
	if (!isAddressRelevant(event.args.to, context.network.name)) {
		return;
	}

	await context.db.insert(transfers).values({
		hash: event.transaction.hash,
		from: event.args.from,
		to: event.args.to,
		timestamp: event.block.timestamp,
		amount: event.args.amount,
		token: event.log.address,
		chainId: context.network.name,
	});

	// await processTransferQueue.add(
	// 	`from: ${event.args.from} to: ${event.args.to} with: ${event.args.amount} for: ${event.log.address} on: ${context.network.name}`,
	// 	{
	// 		from: event.args.from,
	// 		to: event.args.to,
	// 		timestamp: event.block.timestamp,
	// 		amount: event.args.amount,
	// 		token: event.log.address,
	// 		chainId: context.network.name,
	// 		hash: event.transaction.hash,
	// 	},
	// );
});
