import "server-only";
import { sql, type Db } from "./db";
import { quote, type PriceLine, type PromotionRule, type Quote } from "../pricing";
import { isFirstVisit } from "./customers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped database row
function mapPromotion(r: Record<string, any>, treatmentIds: number[]): PromotionRule {
  return {
    id: r.id, name: r.name, code: r.code, application: r.application, discountType: r.discount_type,
    percentOff: r.percent_off, amountOffPence: r.amount_off_pence, maxSavingPence: r.max_saving_pence,
    status: r.status, redeemFrom: r.redeem_from, redeemUntil: r.redeem_until,
    appointmentFrom: r.appointment_from, appointmentUntil: r.appointment_until,
    eligibility: r.eligibility, appliesToAllTreatments: r.applies_to_all_treatments, treatmentIds,
    appliesToExtras: r.applies_to_extras, minSpendPence: r.min_spend_pence,
    usageLimit: r.usage_limit, perCustomerLimit: r.per_customer_limit,
  };
}

/**
 * Loads active promotions. With `lock`, rows are locked FOR UPDATE so that
 * concurrent confirmations evaluate usage limits one at a time.
 */
export async function loadActivePromotions(db: Db, opts: { lock?: boolean } = {}): Promise<PromotionRule[]> {
  const rows = opts.lock
    ? await db`SELECT *, appointment_from::text AS appointment_from, appointment_until::text AS appointment_until FROM promotions WHERE status = 'active' ORDER BY id FOR UPDATE`
    : await db`SELECT *, appointment_from::text AS appointment_from, appointment_until::text AS appointment_until FROM promotions WHERE status = 'active' ORDER BY id`;
  if (!rows.length) return [];
  const links = await db`SELECT promotion_id, treatment_id FROM promotion_treatments WHERE promotion_id IN ${db(rows.map((r) => r.id))}`;
  return rows.map((r) => mapPromotion(r, links.filter((l) => l.promotion_id === r.id).map((l) => l.treatment_id)));
}

export async function loadPromotion(db: Db, id: number): Promise<PromotionRule | null> {
  const [r] = await db`SELECT *, appointment_from::text AS appointment_from, appointment_until::text AS appointment_until FROM promotions WHERE id = ${id}`;
  if (!r) return null;
  const links = await db`SELECT treatment_id FROM promotion_treatments WHERE promotion_id = ${id}`;
  return mapPromotion(r, links.map((l) => l.treatment_id));
}

const COUNTED = ["reserved", "consumed", "forfeited"];

export async function quoteBooking(
  db: Db,
  input: {
    lines: PriceLine[];
    appointmentLocalDate: string;
    code: string | null;
    customer: { id: number | null; phoneNormalised: string | null } | null;
    lock?: boolean;
    excludeBookingId?: number;
  },
): Promise<Quote> {
  const promotions = await loadActivePromotions(db, { lock: input.lock });
  const ids = promotions.map((p) => p.id);
  const totals = new Map<number, number>();
  const mine = new Map<number, number>();
  if (ids.length) {
    for (const r of await db`
      SELECT promotion_id, count(*)::int AS n FROM promotion_redemptions
      WHERE promotion_id IN ${db(ids)} AND status IN ${db(COUNTED)}
        AND booking_id IS DISTINCT FROM ${input.excludeBookingId ?? null}
      GROUP BY promotion_id`) totals.set(r.promotion_id, r.n);
    if (input.customer?.id) {
      for (const r of await db`
        SELECT promotion_id, count(*)::int AS n FROM promotion_redemptions
        WHERE customer_id = ${input.customer.id} AND promotion_id IN ${db(ids)} AND status IN ${db(COUNTED)}
          AND booking_id IS DISTINCT FROM ${input.excludeBookingId ?? null}
        GROUP BY promotion_id`) mine.set(r.promotion_id, r.n);
    }
  }
  let customerCtx: Parameters<typeof quote>[2]["customer"] = null;
  if (input.customer) {
    const first = await isFirstVisit(db, input.customer.id, input.customer.phoneNormalised);
    customerCtx = { isFirstVisit: first, redemptionsOfThis: (pid) => mine.get(pid) ?? 0 };
  }
  return quote(
    input.lines,
    promotions,
    { now: new Date(), appointmentLocalDate: input.appointmentLocalDate, customer: customerCtx, totalRedemptions: (pid) => totals.get(pid) ?? 0 },
    input.code,
  );
}

/** Public banner: the first enabled, currently redeemable offer marked for display. */
export async function publicPromotion(db: Db = sql()) {
  const [r] = await db`
    SELECT id, name, code, banner_text, eligibility, discount_type, percent_off, amount_off_pence, application
    FROM promotions
    WHERE status = 'active' AND show_on_site AND banner_text IS NOT NULL
      AND (redeem_from IS NULL OR redeem_from <= now())
      AND (redeem_until IS NULL OR redeem_until > now())
      AND (usage_limit IS NULL OR usage_limit > (
        SELECT count(*) FROM promotion_redemptions pr
        WHERE pr.promotion_id = promotions.id AND pr.status IN ('reserved','consumed','forfeited')))
    ORDER BY id LIMIT 1`;
  return r ? { name: r.name as string, code: r.code as string | null, bannerText: r.banner_text as string } : null;
}
