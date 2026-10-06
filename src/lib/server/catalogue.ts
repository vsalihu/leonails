import "server-only";
import { sql, type Db } from "./db";
import type { PriceLine } from "../pricing";

export type Extra = { id: number; slug: string; name: string; description: string; pricePence: number; durationMinutes: number; status: string };
export type Treatment = {
  id: number;
  slug: string;
  name: string;
  description: string;
  notes: string | null;
  pricePence: number;
  durationMinutes: number;
  isFeatured: boolean;
  status: string;
  sortOrder: number;
  category: { id: number; slug: string; name: string } | null;
  extras: Extra[];
};

function mapExtra(r: Record<string, unknown>): Extra {
  return {
    id: r.id as number, slug: r.slug as string, name: r.name as string, description: r.description as string,
    pricePence: r.price_pence as number, durationMinutes: r.duration_minutes as number, status: r.status as string,
  };
}

export async function listTreatments(opts: { includeInactive?: boolean } = {}, db: Db = sql()): Promise<Treatment[]> {
  const rows = await db`
    SELECT t.*, c.slug AS c_slug, c.name AS c_name, c.sort_order AS c_sort
    FROM treatments t LEFT JOIN treatment_categories c ON c.id = t.category_id
    WHERE ${opts.includeInactive ? db`t.status <> 'archived'` : db`t.status = 'active'`}
    ORDER BY c.sort_order NULLS LAST, t.sort_order, t.id`;
  const links = await db`
    SELECT te.treatment_id, e.* FROM treatment_extras te JOIN extras e ON e.id = te.extra_id
    WHERE ${opts.includeInactive ? db`e.status <> 'archived'` : db`e.status = 'active'`}
    ORDER BY e.sort_order, e.id`;
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, notes: r.notes,
    pricePence: r.price_pence, durationMinutes: r.duration_minutes, isFeatured: r.is_featured,
    status: r.status, sortOrder: r.sort_order,
    category: r.category_id ? { id: r.category_id, slug: r.c_slug, name: r.c_name } : null,
    extras: links.filter((l) => l.treatment_id === r.id).map(mapExtra),
  }));
}

export class SelectionError extends Error {}

/**
 * Validates a treatment + extras selection against the live catalogue and
 * returns authoritative price lines. Client-supplied prices are never used.
 */
export async function resolveSelection(treatmentId: number, extraIds: number[], db: Db = sql()): Promise<PriceLine[]> {
  const unique = [...new Set(extraIds)];
  const [t] = await db`SELECT id, name, price_pence, duration_minutes FROM treatments WHERE id = ${treatmentId} AND status = 'active'`;
  if (!t) throw new SelectionError("That treatment is no longer available. Please choose another.");
  const extras = unique.length
    ? await db`
        SELECT e.id, e.name, e.price_pence, e.duration_minutes FROM extras e
        JOIN treatment_extras te ON te.extra_id = e.id AND te.treatment_id = ${treatmentId}
        WHERE e.id IN ${db(unique)} AND e.status = 'active' ORDER BY e.sort_order, e.id`
    : [];
  if (extras.length !== unique.length) throw new SelectionError("One of the extras you chose isn't available with this treatment.");
  return [
    { kind: "treatment", id: t.id, name: t.name, pricePence: t.price_pence, durationMinutes: t.duration_minutes },
    ...extras.map((e) => ({ kind: "extra" as const, id: e.id as number, name: e.name as string, pricePence: e.price_pence as number, durationMinutes: e.duration_minutes as number })),
  ];
}
