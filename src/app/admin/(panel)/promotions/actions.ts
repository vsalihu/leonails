"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, type ActionState } from "@/lib/server/action";
import { sql, pgCode, PG_UNIQUE_VIOLATION } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { audit } from "@/lib/server/audit";
import { normaliseCode } from "@/lib/pricing";
import { parsePounds } from "@/lib/money";

export async function savePromotionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const s = await getSettings();
  const id = fd.int(form, "id");
  const name = fd.str(form, "name");
  const application = fd.str(form, "application") === "automatic" ? "automatic" : "code";
  const code = application === "code" ? normaliseCode(fd.str(form, "code")) : null;
  const type = fd.str(form, "discountType") === "fixed" ? "fixed" : "percent";
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter a name.";
  if (application === "code" && !/^[A-Z0-9-]{3,30}$/.test(code ?? "")) errors.code = "Use 3 to 30 letters, numbers or hyphens.";
  const percent = type === "percent" ? fd.int(form, "percentOff") : null;
  if (type === "percent" && (!percent || percent < 1 || percent > 100)) errors.percentOff = "Enter a percentage from 1 to 100.";
  const amount = type === "fixed" ? parsePounds(fd.str(form, "amountOff")) : null;
  if (type === "fixed" && (!amount || amount <= 0)) errors.amountOff = "Enter an amount like 5 or 7.50.";
  const maxSavingText = fd.str(form, "maxSaving");
  const maxSaving = maxSavingText ? parsePounds(maxSavingText) : null;
  if (maxSavingText && !maxSaving) errors.maxSaving = "Enter an amount or leave blank.";
  const minSpendText = fd.str(form, "minSpend");
  const minSpend = minSpendText ? parsePounds(minSpendText) : 0;
  if (minSpend === null) errors.minSpend = "Enter an amount or leave blank.";
  const toInstant = (k: string) => {
    const v = fd.str(form, k);
    if (!v) return null;
    const d = DateTime.fromISO(v, { zone: s.timezone });
    if (!d.isValid) errors[k] = "Invalid date/time.";
    return d.isValid ? d.toJSDate() : null;
  };
  const redeemFrom = toInstant("redeemFrom");
  const redeemUntil = toInstant("redeemUntil");
  if (redeemFrom && redeemUntil && redeemUntil <= redeemFrom) errors.redeemUntil = "Must be after the start.";
  const apptFrom = fd.opt(form, "appointmentFrom");
  const apptUntil = fd.opt(form, "appointmentUntil");
  if (apptFrom && apptUntil && apptUntil < apptFrom) errors.appointmentUntil = "Must be on or after the first date.";
  const usageLimit = fd.int(form, "usageLimit");
  const perCustomer = fd.int(form, "perCustomerLimit");
  if (usageLimit !== null && usageLimit < 1) errors.usageLimit = "Leave blank for no limit.";
  if (perCustomer !== null && perCustomer < 1) errors.perCustomerLimit = "Leave blank for no limit.";
  const allTreatments = fd.str(form, "scope") !== "some";
  const treatments = fd.ids(form, "treatments");
  if (!allTreatments && treatments.length === 0) errors.treatments = "Choose at least one treatment.";
  const showOnSite = fd.bool(form, "showOnSite");
  const banner = fd.opt(form, "bannerText");
  if (showOnSite && !banner) errors.bannerText = "Add banner text to show the offer on the website.";
  if (Object.keys(errors).length) return fail("Please check the highlighted fields.", errors);

  const values = {
    name, code, application, discount_type: type, percent_off: percent, amount_off_pence: amount, max_saving_pence: maxSaving,
    status: fd.str(form, "status") === "disabled" ? "disabled" : "active",
    redeem_from: redeemFrom, redeem_until: redeemUntil, appointment_from: apptFrom, appointment_until: apptUntil,
    eligibility: fd.str(form, "eligibility") === "first_visit" ? "first_visit" : "all",
    applies_to_all_treatments: allTreatments, applies_to_extras: fd.bool(form, "appliesToExtras"),
    min_spend_pence: minSpend, usage_limit: usageLimit, per_customer_limit: perCustomer, show_on_site: showOnSite, banner_text: banner,
  };
  try {
    await sql().begin(async (tx) => {
      let pid = id;
      if (id) {
        await tx`UPDATE promotions SET ${tx(values)}, is_example = false, updated_at = now() WHERE id = ${id}`;
      } else {
        const [r] = await tx`INSERT INTO promotions ${tx(values)} RETURNING id`;
        pid = r.id;
      }
      await tx`DELETE FROM promotion_treatments WHERE promotion_id = ${pid}`;
      if (!allTreatments) for (const t of treatments) await tx`INSERT INTO promotion_treatments (promotion_id, treatment_id) VALUES (${pid}, ${t})`;
      await audit(tx, { type: "admin", id: admin.id }, id ? "promotion.updated" : "promotion.created", "promotion", pid!, { details: values as never });
    });
  } catch (e) {
    if (pgCode(e) === PG_UNIQUE_VIOLATION) return fail("Another offer already uses that code.", { code: "Already in use." });
    throw e;
  }
  revalidatePath("/admin/promotions");
  revalidatePath("/");
  return done(id ? "Offer saved. Existing bookings keep the price they were booked at." : "Offer created.");
}
