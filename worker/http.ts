/**
 * Shared HTTP helpers. Every error response uses the one shape the client
 * parses: `{ error: { code, message } }` (§13).
 */

export interface ErrorBody {
  error: { code: string; message: string };
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } } satisfies ErrorBody, status);
}

/** Thrown by handlers to return a coded error without unwinding by hand. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  toResponse(): Response {
    return fail(this.status, this.code, this.message);
  }
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
  };
}
