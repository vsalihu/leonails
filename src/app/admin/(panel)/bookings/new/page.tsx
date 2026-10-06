import type { Metadata } from "next";
import { listTreatments } from "@/lib/server/catalogue";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { createBookingAction } from "../actions";
import { formatDuration, formatPence } from "@/lib/money";

export const metadata: Metadata = { title: "New booking" };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ date?: string; time?: string }> }) {
  const sp = await searchParams;
  const treatments = await listTreatments();
  const extras = [...new Map(treatments.flatMap((t) => t.extras).map((e) => [e.id, e])).values()];
  return (
    <>
      <PageHeader title="New booking" back={{ href: "/admin/bookings", label: "Bookings" }} />
      <Panel>
        <ActionForm action={createBookingAction} submitLabel="Create booking" pendingLabel="Creating" className="grid max-w-3xl gap-5 md:grid-cols-2">
          <AField name="name" label="Customer name"><input name="name" className="input" required autoComplete="off" /></AField>
          <AField name="email" label="Email" help="Existing customers are matched by email."><input name="email" type="email" className="input" required autoComplete="off" /></AField>
          <AField name="phone" label="Phone"><input name="phone" type="tel" className="input" autoComplete="off" /></AField>
          <AField name="treatmentId" label="Treatment">
            <select name="treatmentId" className="input" required>
              {treatments.map((t) => <option key={t.id} value={t.id}>{t.name} ({formatPence(t.pricePence)}, {formatDuration(t.durationMinutes)})</option>)}
            </select>
          </AField>
          {extras.length > 0 && (
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-medium">Extras</legend>
              <p className="text-xs text-taupe">Only extras compatible with the chosen treatment are accepted.</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                {extras.map((e) => (
                  <label key={e.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="extras" value={e.id} className="accent-[var(--color-ink)]" />{e.name} (+{formatPence(e.pricePence)}, +{e.durationMinutes} min)</label>
                ))}
              </div>
            </fieldset>
          )}
          <AField name="date" label="Date"><input name="date" type="date" defaultValue={sp.date} className="input" required /></AField>
          <AField name="time" label="Start time"><input name="time" type="time" step={300} defaultValue={sp.time} className="input" required /></AField>
          <AField name="code" label="Offer code (optional)"><input name="code" className="input uppercase" /></AField>
          <AField name="discount" label="Or manual discount (£)" help="Replaces any offer. A reason is required."><input name="discount" inputMode="decimal" className="input" /></AField>
          <AField name="discountReason" label="Discount reason" className="md:col-span-2"><input name="discountReason" className="input" /></AField>
          <AField name="notes" label="Notes" className="md:col-span-2"><textarea name="notes" rows={2} className="input" /></AField>
          <div className="grid gap-2 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="sendConfirmation" defaultChecked className="accent-[var(--color-ink)]" /> Email a confirmation (with address and management link) and a reminder</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="outsideHours" className="accent-[var(--color-ink)]" /> Allow outside working hours</label>
            <p className="text-xs text-taupe">Overlapping appointments are always refused.</p>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
