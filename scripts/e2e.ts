import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

console.log("E2E test");

const merchantAccount = privateKeyToAccount(process.env.CUSTOMER_WALLET_KEY as Address);
// const customerAccount = privateKeyToAccount(process.env.CUSTOMER_WALLET_KEY as Address);

const nonce = async () => fetch("http://localhost:3000/nonce").then(res => res.text());
const login = async (address: Address, signature: Address, nonce: string) => {
    const response = await fetch("http://localhost:3000/merchants/login",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                address,
                signature,
                nonce,
            }),
        });

    return response.json();
}

const testAuth = async () => {
    const nonce = await getNonce();
    console.log(`Nonce: ${nonce}`);
    const message = `Login merchant for address ${merchantAccount.address} with nonce ${nonce}`;
    console.log(`Message: ${message}`);
    const signature = await merchantAccount.signMessage({message})
    console.log(`Signature: ${signature}`);
    const loginResponse = await login(merchantAccount.address, signature, nonce) as { token: string };
    console.table(loginResponse);
    await fetch("http://localhost:3000/auth-test", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${loginResponse.token}`,
        }
    })
}

await testAuth()