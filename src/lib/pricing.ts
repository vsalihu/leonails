/**
 * Pure price and promotion evaluation. All money is integer pence.
 * The server is the only place these results are trusted.
 */

export type PriceLine = {
  kind: "treatment" | "extra";
  id: number;
  name: string;
  pricePence: number;
  durationMinutes: number;
};

export type PromotionRule = {
  id: number;
  name: string;
  code: string | null;
  application: "code" | "automatic";
  discountType: "percent" | "fixed";
  percentOff: number | null;
  amountOffPence: number | null;
  maxSavingPence: number | null;
  status: "active" | "disabled";
  redeemFrom: Date | null;
  redeemUntil: Date | null;
  appointmentFrom: string | null; // local YYYY-MM-DD
  appointmentUntil: string | null;
  eligibility: "all" | "first_visit";
  appliesToAllTreatments: boolean;
  treatmentIds: number[];
  appliesToExtras: boolean;
  minSpendPence: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
};

export type PromotionContext = {
  now: Date;
  appointmentLocalDate: string;
  lines: PriceLine[];
  /** Null when the customer identity is not yet known (before email entry). */
  customer: { isFirstVisit: boolean; redemptionsOfThis: (promotionId: number) => number } | null;
  totalRedemptions: (promotionId: number) => number;
};

export type PromotionResult =
  | { ok: true; promotion: PromotionRule; savingPence: number }
  | { ok: false; promotion: PromotionRule; reason: string };

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function subtotal(lines: PriceLine[]): number {
  return lines.reduce((sum, l) => sum + l.pricePence, 0);
}

export function totalDuration(lines: PriceLine[]): number {
  return lines.reduce((sum, l) => sum + l.durationMinutes, 0);
}

/** Percentage of an amount in pence, rounded half-up to the nearest penny, once. */
export function percentOf(amountPence: number, percent: number): number {
  return Math.floor((amountPence * percent + 50) / 100);
}

export function evaluatePromotion(p: PromotionRule, ctx: PromotionContext): PromotionResult {
  const fail = (reason: string): PromotionResult => ({ ok: false, promotion: p, reason });
  if (p.status !== "active") return fail("This offer is no longer available.");
  if (p.redeemFrom && ctx.now < p.redeemFrom) return fail("This offer has not started yet.");
  if (p.redeemUntil && ctx.now > p.redeemUntil) return fail("This offer has expired.");
  if (p.appointmentFrom && ctx.appointmentLocalDate < p.appointmentFrom)
    return fail(`This offer applies to appointments from ${formatDate(p.appointmentFrom)}.`);
  if (p.appointmentUntil && ctx.appointmentLocalDate > p.appointmentUntil)
    return fail(`This offer applies to appointments up to ${formatDate(p.appointmentUntil)}.`);

  const treatment = ctx.lines.find((l) => l.kind === "treatment");
  const treatmentEligible = !!treatment && (p.appliesToAllTreatments || p.treatmentIds.includes(treatment.id));
  if (!treatmentEligible) return fail("This offer doesn't apply to the treatment you've chosen.");

  const total = subtotal(ctx.lines);
  if (total < p.minSpendPence) return fail(`This offer needs a minimum spend of ${formatGBP(p.minSpendPence)}.`);

  if (p.usageLimit !== null && ctx.totalRedemptions(p.id) >= p.usageLimit)
    return fail("This offer has been fully redeemed.");

  if (ctx.customer) {
    if (p.eligibility === "first_visit" && !ctx.customer.isFirstVisit)
      return fail("This offer is for first visits only.");
    if (p.perCustomerLimit !== null && ctx.customer.redemptionsOfThis(p.id) >= p.perCustomerLimit)
      return fail("You've already used this offer.");
  }

  const eligible = ctx.lines
    .filter((l) => l.kind === "treatment" || p.appliesToExtras)
    .reduce((s, l) => s + l.pricePence, 0);

  let saving =
    p.discountType === "percent" ? percentOf(eligible, p.percentOff ?? 0) : Math.min(p.amountOffPence ?? 0, eligible);
  if (p.maxSavingPence !== null) saving = Math.min(saving, p.maxSavingPence);
  saving = Math.max(0, Math.min(saving, total)); // never a negative total
  if (saving === 0) return fail("This offer doesn't reduce the price of this booking.");
  return { ok: true, promotion: p, savingPence: saving };
}

export type Quote = {
  lines: PriceLine[];
  subtotalPence: number;
  discountPence: number;
  totalPence: number;
  durationMinutes: number;
  applied: { promotionId: number; name: string; code: string | null; savingPence: number } | null;
  codeResult: { code: string; ok: boolean; message: string } | null;
  /** Shown when the customer identity is unknown and an offer may still be rejected later. */
  provisional: boolean;
};

/**
 * Applies at most one promotion: the highest eligible automatic offer, unless a
 * valid entered code saves at least as much. The customer always gets the
 * better of the two, and is told which one applied.
 */
export function quote(
  lines: PriceLine[],
  promotions: PromotionRule[],
  ctx: Omit<PromotionContext, "lines">,
  enteredCode: string | null,
): Quote {
  const full: PromotionContext = { ...ctx, lines };
  const sub = subtotal(lines);

  const autos = promotions
    .filter((p) => p.application === "automatic")
    .map((p) => evaluatePromotion(p, full))
    .filter((r): r is Extract<PromotionResult, { ok: true }> => r.ok)
    .sort((a, b) => b.savingPence - a.savingPence || a.promotion.id - b.promotion.id);
  let best: Extract<PromotionResult, { ok: true }> | null = autos[0] ?? null;

  let codeResult: Quote["codeResult"] = null;
  if (enteredCode && enteredCode.trim()) {
    const code = normaliseCode(enteredCode);
    const promo = promotions.find((p) => p.application === "code" && p.code === code);
    if (!promo) {
      codeResult = { code, ok: false, message: "We don't recognise that code. Please check the spelling." };
    } else {
      const r = evaluatePromotion(promo, full);
      if (!r.ok) {
        codeResult = { code, ok: false, message: r.reason };
      } else if (best && best.savingPence > r.savingPence) {
        codeResult = {
          code,
          ok: false,
          message: `${best.promotion.name} already saves you more, so we've kept that instead.`,
        };
      } else {
        best = r;
        codeResult = { code, ok: true, message: `${promo.name} applied.` };
      }
    }
  }

  const discount = best?.savingPence ?? 0;
  return {
    lines,
    subtotalPence: sub,
    discountPence: discount,
    totalPence: sub - discount,
    durationMinutes: totalDuration(lines),
    applied: best
      ? { promotionId: best.promotion.id, name: best.promotion.name, code: best.promotion.code, savingPence: discount }
      : null,
    codeResult,
    provisional: ctx.customer === null && !!best && (best.promotion.eligibility === "first_visit" || best.promotion.perCustomerLimit !== null),
  };
}

function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100).replace(/\.00$/, "");
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
