import Fastify from "fastify";
import {prisma} from "./db";

const fastify = Fastify({
    logger: true,
});

fastify.get("/", async (request, response) => {
    const users = await prisma.user.findMany();
    return ({users})
})

const start = async () => {
    try {
        await fastify.listen({port: 4000})
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()