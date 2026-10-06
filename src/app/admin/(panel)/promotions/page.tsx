import type { Metadata } from "next";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { PageHeader, Panel, StatusBadge, ExampleFlag } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { formatPence } from "@/lib/money";
import { savePromotionAction } from "./actions";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const db = sql();
  const s = await getSettings();
  const [promos, treatments, links, counts] = await Promise.all([
    db`SELECT *, appointment_from::text AS af, appointment_until::text AS au FROM promotions ORDER BY status, id DESC`,
    db`SELECT id, name FROM treatments WHERE status <> 'archived' ORDER BY sort_order`,
    db`SELECT * FROM promotion_treatments`,
    db`SELECT promotion_id, status, count(*)::int AS n FROM promotion_redemptions GROUP BY promotion_id, status`,
  ]);
  const local = (d: Date | null) => (d ? DateTime.fromJSDate(d, { zone: s.timezone }).toFormat("yyyy-LL-dd'T'HH:mm") : "");
  const stateOf = (p: (typeof promos)[number]) => {
    if (p.status === "disabled") return "disabled";
    if (p.redeem_from && p.redeem_from > new Date()) return "scheduled";
    if (p.redeem_until && p.redeem_until < new Date()) return "expired";
    return "active";
  };
  const used = (id: number, st: string[]) => counts.filter((c) => c.promotion_id === id && st.includes(c.status)).reduce((a, c) => a + c.n, 0);

  const promoForm = (p?: (typeof promos)[number]) => (
    <ActionForm action={savePromotionAction} submitLabel={p ? "Save offer" : "Create offer"} resetOnSuccess={!p} className="grid gap-4 md:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <AField name="name" label="Name (shown to customers)"><input name="name" defaultValue={p?.name ?? ""} className="input" /></AField>
      <AField name="status" label="Status"><select name="status" defaultValue={p?.status ?? "active"} className="input"><option value="active">Enabled</option><option value="disabled">Disabled</option></select></AField>
      <AField name="application" label="How it applies"><select name="application" defaultValue={p?.application ?? "code"} className="input"><option value="code">Customer enters a code</option><option value="automatic">Automatic (no code)</option></select></AField>
      <AField name="code" label="Code" help="Ignored for automatic offers. Not case-sensitive."><input name="code" defaultValue={p?.code ?? ""} className="input uppercase" /></AField>
      <AField name="discountType" label="Discount"><select name="discountType" defaultValue={p?.discount_type ?? "percent"} className="input"><option value="percent">Percentage</option><option value="fixed">Fixed amount (£)</option></select></AField>
      <div className="grid grid-cols-2 gap-3">
        <AField name="percentOff" label="Percent off"><input name="percentOff" type="number" min={1} max={100} defaultValue={p?.percent_off ?? ""} className="input" /></AField>
        <AField name="amountOff" label="Amount off (£)"><input name="amountOff" inputMode="decimal" defaultValue={p?.amount_off_pence ? (p.amount_off_pence / 100).toFixed(2) : ""} className="input" /></AField>
      </div>
      <AField name="maxSaving" label="Maximum saving (£, optional)" help="Caps percentage offers."><input name="maxSaving" inputMode="decimal" defaultValue={p?.max_saving_pence ? (p.max_saving_pence / 100).toFixed(2) : ""} className="input" /></AField>
      <AField name="minSpend" label="Minimum spend (£, optional)"><input name="minSpend" inputMode="decimal" defaultValue={p?.min_spend_pence ? (p.min_spend_pence / 100).toFixed(2) : ""} className="input" /></AField>
      <AField name="eligibility" label="Who can use it"><select name="eligibility" defaultValue={p?.eligibility ?? "all"} className="input"><option value="all">All clients</option><option value="first_visit">First visit only</option></select></AField>
      <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="appliesToExtras" defaultChecked={p?.applies_to_extras ?? true} className="accent-[var(--color-ink)]" /> Discount extras too</label>
      <AField name="redeemFrom" label="Can be used from (optional)"><input name="redeemFrom" type="datetime-local" defaultValue={local(p?.redeem_from)} className="input" /></AField>
      <AField name="redeemUntil" label="Can be used until (optional)"><input name="redeemUntil" type="datetime-local" defaultValue={local(p?.redeem_until)} className="input" /></AField>
      <AField name="appointmentFrom" label="For appointments from (optional)"><input name="appointmentFrom" type="date" defaultValue={p?.af ?? ""} className="input" /></AField>
      <AField name="appointmentUntil" label="For appointments until (optional)"><input name="appointmentUntil" type="date" defaultValue={p?.au ?? ""} className="input" /></AField>
      <AField name="usageLimit" label="Total uses (optional)"><input name="usageLimit" type="number" min={1} defaultValue={p?.usage_limit ?? ""} className="input" /></AField>
      <AField name="perCustomerLimit" label="Uses per client (optional)"><input name="perCustomerLimit" type="number" min={1} defaultValue={p?.per_customer_limit ?? ""} className="input" /></AField>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-medium">Treatments</legend>
        <div className="mt-2 flex gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="scope" value="all" defaultChecked={p ? p.applies_to_all_treatments : true} className="accent-[var(--color-ink)]" /> All treatments</label>
          <label className="flex items-center gap-2"><input type="radio" name="scope" value="some" defaultChecked={p ? !p.applies_to_all_treatments : false} className="accent-[var(--color-ink)]" /> Only these:</label>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {treatments.map((t) => (
            <label key={t.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="treatments" value={t.id} defaultChecked={!!p && links.some((l) => l.promotion_id === p.id && l.treatment_id === t.id)} className="accent-[var(--color-ink)]" />{t.name}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="showOnSite" defaultChecked={p?.show_on_site} className="accent-[var(--color-ink)]" /> Show on the website while it can be used</label>
      <AField name="bannerText" label="Website banner text" className="md:col-span-2"><input name="bannerText" defaultValue={p?.banner_text ?? ""} className="input" /></AField>
    </ActionForm>
  );

  return (
    <>
      <PageHeader title="Promotions" />
      <p className="mb-6 max-w-2xl text-sm text-taupe">One offer applies per booking: the best automatic offer, or a code the client enters if it saves at least as much. Discounts never take a total below £0.</p>
      <div className="space-y-3">
        {promos.map((p) => (
          <details key={p.id} className="border border-line bg-paper">
            <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span> <ExampleFlag show={p.is_example} />
                <span className="block text-sm text-taupe">
                  {p.code ?? "Automatic"} · {p.discount_type === "percent" ? `${p.percent_off}% off` : `${formatPence(p.amount_off_pence)} off`}
                  {p.eligibility === "first_visit" ? " · first visit" : ""} · used {used(p.id, ["reserved", "consumed", "forfeited"])}{p.usage_limit ? ` of ${p.usage_limit}` : ""}
                  {used(p.id, ["reserved"]) > 0 ? ` (${used(p.id, ["reserved"])} on upcoming bookings)` : ""}
                </span>
              </span>
              <StatusBadge status={stateOf(p)} />
              <span className="text-sm text-taupe">Edit</span>
            </summary>
            <div className="border-t border-line p-4">{promoForm(p)}</div>
          </details>
        ))}
      </div>
      <div className="mt-6"><Panel title="New offer">{promoForm()}</Panel></div>
    </>
  );
}
