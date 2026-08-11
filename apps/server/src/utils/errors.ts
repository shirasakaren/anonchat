import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: (message = "You need to be signed in to do that.") => new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You don't have access to that.") => new AppError(403, "FORBIDDEN", message),
  notFound: (message = "Not found.") => new AppError(404, "NOT_FOUND", message),
  badRequest: (message = "That request doesn't look right.") => new AppError(400, "BAD_REQUEST", message),
  conflict: (message = "That already exists.") => new AppError(409, "CONFLICT", message),
  blocked: (message = "You can no longer send messages in this conversation.") =>
    new AppError(403, "BLOCKED", message),
  rateLimited: (message = "You're sending messages too quickly. Please slow down and try again shortly.") =>
    new AppError(429, "RATE_LIMITED", message),
  tooLarge: (message = "That upload is too large.") => new AppError(413, "PAYLOAD_TOO_LARGE", message),
};

interface ClientFastifyError {
  statusCode: number;
  code?: string;
  message: string;
}

/** Fastify's own built-in errors (bad JSON, empty body, oversized body, etc.) - their messages are already safe/generic to relay as-is. */
function isClientFastifyError(error: unknown): error is ClientFastifyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number" &&
    (error as { statusCode: number }).statusCode >= 400 &&
    (error as { statusCode: number }).statusCode < 500
  );
}

/**
 * Fastify error handler: never leaks stack traces, SQL errors, internal ids,
 * or file paths to the client (spec section 45). Unexpected errors are
 * logged server-side with full detail and returned to the client as a
 * generic message only.
 */
export function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields were invalid.",
        fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (isClientFastifyError(error)) {
    reply.status(error.statusCode).send({ error: { code: error.code ?? "BAD_REQUEST", message: error.message } });
    return;
  }
  request.log.error({ err: error }, "unhandled error");
  reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}
