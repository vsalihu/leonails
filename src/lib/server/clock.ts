import "server-only";

/** Request-time clock for server components (kept out of render bodies for the React Compiler lint). */
export function nowMs(): number {
  return Date.now();
}
