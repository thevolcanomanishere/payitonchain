import { createConfig } from "@ponder/core";
import { http } from "viem";
import { erc20ABI } from "./abis/erc20ABI";
import { arbitrum, base, optimism } from "viem/chains";

if(!process.env.DATABASE_URL_INDEXER){
  throw new Error("DATABASE_URL_INDEXER is not set");
}

console.log("tests")
export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL_INDEXER,
  },
  networks: {
    /**
     * 250ms block times on arbitrum lead to extreme usage of the alchemy RPC
     */
    // arbitrum: {
    //   chainId: arbitrum.id,
    //   transport: http("https://arb-mainnet.g.alchemy.com/v2/pyPg4V28YnWoLF1ZUH-pfgoDGqKWY9pZ"),
    // },
    // base: {
    //   chainId: base.id,
    //   transport: http("https://base-mainnet.g.alchemy.com/v2/sjlKG_gODlckpb49H882ur-bXKbzqvFm")
    // },
    optimism: {
      chainId: optimism.id,
      transport: http("https://opt-mainnet.g.alchemy.com/v2/sjlKG_gODlckpb49H882ur-bXKbzqvFm")
    }
  },
  contracts: {
    BENIS: {
      abi: erc20ABI,
      network: {
        optimism: {
          address: "0x57dEF52ABb90062cfaA90b5d6b0C9339AE122ABF",
          startBlock: 128814387,
        }
      }
    },
  },
});
