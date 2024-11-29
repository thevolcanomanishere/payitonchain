import { ponder } from "@/generated";
import { transfers } from "../ponder.schema";



/**
 * Do we need to index events from this address
 */
const isAddressRelevant = (address: string) => {
  // In future, we might want to store the block number that we want to start indexing from for each address.
  // This would be the block number when the merchant created their first product/link etc.
  // Check if the address is relevant to your application.
  return true;
}

ponder.on("BENIS:Transfer", async ({event, context}) => {
  if (!isAddressRelevant(event.args.to)) {
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
  })
});