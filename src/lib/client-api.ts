/** JSON fetch helper for the site's own API routes (same-origin). */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; body: Record<string, unknown> };

export async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: body.error ?? "Something went wrong. Please try again.", body };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again.", body: {} };
  }
}

/** Field-level messages from a 422 response ({ fields: { name: "..." } }). */
export function fieldErrors(body: Record<string, unknown>): Record<string, string> {
  return (body.fields as Record<string, string> | undefined) ?? {};
}
