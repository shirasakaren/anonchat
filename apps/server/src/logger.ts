import type { LoggerOptions } from "pino";
import { loadEnv } from "./env.js";

/**
 * Never logs request/response bodies (message content lives there) or
 * credential-bearing headers/cookies - only structured request metadata.
 */
export function buildLoggerOptions(): LoggerOptions {
  const env = loadEnv();
  const base: LoggerOptions = {
    level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers['x-termine-csrf']",
        "res.headers['set-cookie']",
      ],
      censor: "[redacted]",
    },
  };
  if (env.NODE_ENV !== "production") {
    return { ...base, transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } };
  }
  return base;
}
