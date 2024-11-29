import { createConfig } from "@ponder/core";
import { http } from "viem";
import { erc20ABI } from "./abis/erc20ABI";
import { arbitrum } from "viem/chains";

export default createConfig({
  networks: {
    arbitrum: {
      chainId: arbitrum.id,
      transport: http("https://arb-mainnet.g.alchemy.com/v2/pyPg4V28YnWoLF1ZUH-pfgoDGqKWY9pZ"),
    },
  },
  contracts: {
    BENIS: {
      network: "arbitrum",
      abi: erc20ABI,
      address: "0x57dEF52ABb90062cfaA90b5d6b0C9339AE122ABF",
      startBlock: 279496772,
    },
  },
});
