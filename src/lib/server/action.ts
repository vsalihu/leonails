import "server-only";
import { z } from "zod";
import { BookingError } from "./holds";
import { SelectionError } from "./catalogue";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string>; at?: number } | null;

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, message, fieldErrors, at: Date.now() };
}
export function done(message = "Saved."): ActionState {
  return { ok: true, message, at: Date.now() };
}

export function fromZod(err: z.ZodError): ActionState {
  const fieldErrors = Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message]));
  return fail(err.issues[0]?.message ?? "Please check the form.", fieldErrors);
}

/** Maps expected domain errors to form messages; rethrows anything unexpected (incl. redirects). */
export function caught(err: unknown): ActionState {
  if (err instanceof BookingError || err instanceof SelectionError) return fail(err.message);
  throw err;
}

/** FormData helpers */
export const fd = {
  str: (f: FormData, k: string) => String(f.get(k) ?? "").trim(),
  opt: (f: FormData, k: string) => {
    const v = String(f.get(k) ?? "").trim();
    return v === "" ? null : v;
  },
  bool: (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true" || f.get(k) === "1",
  int: (f: FormData, k: string) => {
    const v = String(f.get(k) ?? "").trim();
    return v === "" ? null : Number.parseInt(v, 10);
  },
  ids: (f: FormData, k: string) => f.getAll(k).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0),
};
