import "server-only";
import type { Db } from "./db";

export type Actor = { type: "admin"; id: number } | { type: "customer"; id: number | null } | { type: "system" };

export async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: number | null,
  opts: { reason?: string | null; details?: Record<string, unknown> } = {},
) {
  const actorId = actor.type === "system" ? null : actor.id;
  await db`
    INSERT INTO audit_events (actor_type, actor_id, action, entity_type, entity_id, reason, details)
    VALUES (${actor.type}, ${actorId}, ${action}, ${entityType}, ${entityId}, ${opts.reason ?? null},
            ${db.json((opts.details ?? {}) as never)})`;
}
