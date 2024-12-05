import type { FastifyInstance } from "fastify";
import { db } from "../src/db";

export const siweApi = async (fastify: FastifyInstance) => {

    void fastify.register(async instance => {
        instance.get("/nonce", {} , async (request, reply) => {
            const record = await db.nonce.create({
                data: {
                    nonce: crypto.randomUUID(),
                },
            });
        
            return record.nonce;
        });

        instance.post("/verify", {}, async (request, reply) => {
        });

        instance.get("/logout", {}, async (request, reply) => {});
    })

}