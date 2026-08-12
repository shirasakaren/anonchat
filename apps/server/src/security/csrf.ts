import type { FastifyReply, FastifyRequest } from "fastify";
import { CSRF_COOKIE, CSRF_HEADER } from "@anonchat/shared";
import { generateSessionToken, isSecureContext } from "../auth/session.js";
import { Errors } from "../utils/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit cookie CSRF protection: the token is readable JS-side (not
 * httpOnly) precisely so the client can echo it back in a header, which a
 * cross-site form/script cannot do for another origin's cookie.
 */
export function ensureCsrfCookie(request: FastifyRequest, reply: FastifyReply): void {
  if (request.cookies[CSRF_COOKIE]) return;
  const token = generateSessionToken();
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function verifyCsrf(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  const cookieToken = request.cookies[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || Array.isArray(headerToken) || cookieToken !== headerToken) {
    throw Errors.forbidden("Invalid or missing CSRF token. Please refresh the page and try again.");
  }
}
