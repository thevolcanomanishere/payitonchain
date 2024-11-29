
import { onchainEnum, onchainTable } from "@ponder/core";
 
export const transfers = onchainTable("transfers", (t) => ({
  hash: t.hex().primaryKey(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  amount: t.bigint().notNull(),
  token: t.hex().notNull(),
  chainId: t.text().notNull(),
}));

const paymentStatus = onchainEnum("payment_status", ["pending", "completed", "failed", "cancelled"]);


/**
 * Anyone can make a payment intent by sending a request with
 * 
 * - signed message of the intent: to, amount, token, chainId
 */

export const paymentIntents = onchainTable("payment_intents", (t) => ({
  id: t.uuid().primaryKey(),
  status: paymentStatus().$default(() => "pending"),
  extId: t.text().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  amount: t.bigint().notNull(),
  token: t.hex().notNull(),
  chainId: t.text().notNull(),
}));


export const merchant = onchainTable("merchant", (t) => ({
  id: t.uuid().primaryKey(),
  name: t.text().notNull(),
  address: t.hex().notNull(),
  webhookUrl: t.text().notNull(),
  createAt: t.timestamp().notNull().$default(() => new Date()),
}));