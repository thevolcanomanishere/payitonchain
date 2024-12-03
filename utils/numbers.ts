import { Decimal } from "@prisma/client/runtime/library";
import type { Address } from "viem";

/** 
 * Just going to assume all contracts are 6 decimals (like usdc)
 * This should be dynamic
 */
export const toReadableNumber = (number: bigint | string | number, tokenAddress: Address) => {
    console.log("Converting", number, "to readable number for token", tokenAddress);    
    if(typeof number === "bigint") {
        const asString = number.toString();
        return new Decimal(asString).div(10 ** 6);
    }
    return new Decimal(number).div(10 ** 18);
}