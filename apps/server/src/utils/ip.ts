import type { FastifyRequest } from "fastify";
import { loadEnv } from "../env.js";

/** Only trusts X-Forwarded-For when explicitly told this instance sits behind a proxy. */
export function getClientIp(request: FastifyRequest): string {
  const env = loadEnv();
  if (env.TRUST_PROXY) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return request.ip;
}
