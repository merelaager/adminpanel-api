import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const securityHeadersPlugin: FastifyPluginAsync = fp(async (server) => {
  server.addHook("onSend", async (request, reply) => {
    // Never let a browser sniff a response into HTML (JSON/PDF stay inert).
    reply.header("X-Content-Type-Options", "nosniff");

    // The Swagger UI (dev only) is a HTML page with its own scripts.
    if (request.url.startsWith("/documentation")) return;

    // If an API response is ever rendered directly in a browser, block all
    // script execution and embedding.
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    reply.header("X-Frame-Options", "DENY");
  });
});

export default securityHeadersPlugin;
