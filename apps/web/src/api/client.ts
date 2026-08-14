const CSRF_COOKIE = "anonchat_csrf";
const CSRF_HEADER = "x-anonchat-csrf";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Fires when an /admin/* request comes back 401 - e.g. because another
 * browser revoked this session from the admin Sessions page. There was
 * previously no handling for this anywhere: the admin's tab would just sit
 * on stale UI with every subsequent action silently failing. AdminSession
 * context registers itself here so it can drop straight to the sign-in
 * screen instead. Excludes /admin/login itself, since a failed login
 * attempt (wrong password) is an expected 401, not a dead session.
 */
let onAdminUnauthorized: (() => void) | null = null;
export function setAdminUnauthorizedHandler(handler: (() => void) | null): void {
  onAdminUnauthorized = handler;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  isFormData?: boolean;
}

interface ErrorPayload {
  code: string;
  message: string;
  fields?: { path: string; message: string }[];
}

function parseErrorPayload(value: unknown): ErrorPayload {
  const fallback = { code: "UNKNOWN", message: "Something went wrong." };
  if (typeof value !== "object" || value === null || !("error" in value)) return fallback;
  const error = value.error;
  if (typeof error !== "object" || error === null) return fallback;
  const code = "code" in error && typeof error.code === "string" ? error.code : fallback.code;
  const message = "message" in error && typeof error.message === "string" ? error.message : fallback.message;
  const fields =
    "fields" in error &&
    Array.isArray(error.fields) &&
    error.fields.every(
      (field: unknown) =>
        typeof field === "object" &&
        field !== null &&
        "path" in field &&
        typeof field.path === "string" &&
        "message" in field &&
        typeof field.message === "string",
    )
      ? (error.fields as { path: string; message: string }[])
      : undefined;
  return { code, message, fields };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body, credentials: "include" });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json: unknown = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const errorBody = parseErrorPayload(json);
    if (res.status === 401 && path.startsWith("/admin") && path !== "/admin/login") {
      onAdminUnauthorized?.();
    }
    throw new ApiError(res.status, errorBody.code, errorBody.message, errorBody.fields);
  }

  return json as T;
}

/** XMLHttpRequest is used only for multipart attachment sends because the
 *  Fetch API still does not expose upload progress. It follows the same
 *  cookie, CSRF, error, and revoked-admin-session behavior as apiFetch. */
export function apiUpload<T>(path: string, body: FormData, onProgress?: (progress: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) xhr.setRequestHeader(CSRF_HEADER, csrf);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(1, event.loaded / event.total));
    });
    xhr.addEventListener("error", () => reject(new ApiError(0, "NETWORK_ERROR", "Upload failed.")));
    xhr.addEventListener("abort", () => reject(new ApiError(0, "UPLOAD_ABORTED", "Upload was canceled.")));
    xhr.addEventListener("load", () => {
      let json: unknown;
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
      } catch {
        reject(new ApiError(xhr.status, "INVALID_RESPONSE", "The server returned an invalid response."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const errorBody = parseErrorPayload(json);
        if (xhr.status === 401 && path.startsWith("/admin")) onAdminUnauthorized?.();
        reject(new ApiError(xhr.status, errorBody.code, errorBody.message, errorBody.fields));
        return;
      }

      onProgress?.(1);
      resolve(json as T);
    });
    xhr.send(body);
  });
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
