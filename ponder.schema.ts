
import { onchainTable } from "@ponder/core";
 
export const transfers = onchainTable("transfers", (t) => ({
  hash: t.hex().primaryKey(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  amount: t.bigint().notNull(),
  token: t.hex().notNull(),
  chainId: t.integer().notNull(),
}));
