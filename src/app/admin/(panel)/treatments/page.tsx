import type { Metadata } from "next";
import { sql } from "@/lib/server/db";
import { PageHeader, Panel, StatusBadge, ExampleFlag } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { formatDuration, formatPence } from "@/lib/money";
import { moveAction, saveCategoryAction, saveExtraAction, saveTreatmentAction } from "./actions";

export const metadata: Metadata = { title: "Treatments" };

export default async function TreatmentsAdmin({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = sql();
  const [treatments, extras, categories, links] = await Promise.all([
    db`SELECT * FROM treatments ${archived ? db`` : db`WHERE status <> 'archived'`} ORDER BY sort_order, id`,
    db`SELECT * FROM extras ${archived ? db`` : db`WHERE status <> 'archived'`} ORDER BY sort_order, id`,
    db`SELECT * FROM treatment_categories ORDER BY sort_order, id`,
    db`SELECT * FROM treatment_extras`,
  ]);

  const treatmentForm = (t?: (typeof treatments)[number]) => (
    <ActionForm action={saveTreatmentAction} submitLabel={t ? "Save treatment" : "Add treatment"} resetOnSuccess={!t} className="grid gap-4 md:grid-cols-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <AField name="name" label="Name"><input name="name" defaultValue={t?.name} className="input" required /></AField>
      <AField name="categoryId" label="Category">
        <select name="categoryId" defaultValue={t?.category_id ?? categories[0]?.id ?? ""} className="input">
          <option value="">None</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </AField>
      <AField name="price" label="Price (£)"><input name="price" inputMode="decimal" defaultValue={t ? (t.price_pence / 100).toFixed(2) : ""} className="input" required /></AField>
      <AField name="duration" label="Duration (minutes)" help="Service time only; the buffer is added automatically."><input name="duration" type="number" min={5} max={600} step={5} defaultValue={t?.duration_minutes ?? 60} className="input" required /></AField>
      <AField name="description" label="Description" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={t?.description} className="input" /></AField>
      <AField name="notes" label="Requirements or notes (shown to customers)" className="md:col-span-2"><input name="notes" defaultValue={t?.notes ?? ""} className="input" placeholder="e.g. For builder gel applied here within 4 weeks" /></AField>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-medium">Compatible extras</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {extras.filter((e) => e.status !== "archived").map((e) => (
            <label key={e.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="extras" value={e.id} defaultChecked={!!t && links.some((l) => l.treatment_id === t.id && l.extra_id === e.id)} className="accent-[var(--color-ink)]" />{e.name}</label>
          ))}
        </div>
      </fieldset>
      <AField name="status" label="Status">
        <select name="status" defaultValue={t?.status ?? "active"} className="input">
          <option value="active">Active (bookable)</option><option value="inactive">Hidden (not bookable)</option><option value="archived">Archived</option>
        </select>
      </AField>
      <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="featured" defaultChecked={t?.is_featured} className="accent-[var(--color-ink)]" /> Feature on the homepage</label>
    </ActionForm>
  );

  const extraForm = (e?: (typeof extras)[number]) => (
    <ActionForm action={saveExtraAction} submitLabel={e ? "Save extra" : "Add extra"} resetOnSuccess={!e} className="grid gap-4 md:grid-cols-2">
      {e && <input type="hidden" name="id" value={e.id} />}
      <AField name="name" label="Name"><input name="name" defaultValue={e?.name} className="input" required /></AField>
      <AField name="price" label="Price (£)"><input name="price" inputMode="decimal" defaultValue={e ? (e.price_pence / 100).toFixed(2) : ""} className="input" required /></AField>
      <AField name="duration" label="Extra minutes"><input name="duration" type="number" min={0} max={240} step={5} defaultValue={e?.duration_minutes ?? 15} className="input" required /></AField>
      <AField name="status" label="Status">
        <select name="status" defaultValue={e?.status ?? "active"} className="input"><option value="active">Active</option><option value="inactive">Hidden</option><option value="archived">Archived</option></select>
      </AField>
      <AField name="description" label="Description" className="md:col-span-2"><input name="description" defaultValue={e?.description} className="input" /></AField>
    </ActionForm>
  );

  const mover = (id: number, table: string) => (
    <span className="flex flex-col gap-1 pt-1">
      {(["up", "down"] as const).map((dir) => (
        <ActionForm key={dir} action={moveAction} submitLabel={dir === "up" ? "↑" : "↓"} pendingLabel="…" submitClassName="btn btn-outline min-h-9 w-9 px-0" className="[&>div]:mt-0">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="table" value={table} /><input type="hidden" name="dir" value={dir} />
          <span className="sr-only">Move {dir}</span>
        </ActionForm>
      ))}
    </span>
  );

  return (
    <>
      <PageHeader title="Treatments">
        <a href={archived ? "?" : "?archived=1"} className="btn btn-outline min-h-11">{archived ? "Hide archived" : "Show archived"}</a>
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-taupe">Changes apply to new bookings only. Existing bookings keep the name, price and length they were booked with. Items are archived rather than deleted so history stays intact.</p>

      <h2 className="mb-3 text-lg font-medium">Treatments</h2>
      <div className="space-y-3">
        {treatments.map((t) => (
          <div key={t.id} className="flex items-start gap-2">
            <details className="min-w-0 flex-1 border border-line bg-paper">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t.name}</span> <ExampleFlag show={t.is_example} />
                  <span className="block text-sm text-taupe">{formatPence(t.price_pence)} · {formatDuration(t.duration_minutes)}{t.is_featured ? " · Featured" : ""}</span>
                </span>
                <StatusBadge status={t.status} />
                <span className="text-sm text-taupe">Edit</span>
              </summary>
              <div className="border-t border-line p-4">{treatmentForm(t)}</div>
            </details>
            {mover(t.id, "treatments")}
          </div>
        ))}
      </div>
      <div className="mt-4"><Panel title="Add a treatment">{treatmentForm()}</Panel></div>

      <h2 className="mb-3 mt-12 text-lg font-medium">Extras</h2>
      <div className="space-y-3">
        {extras.map((e) => (
          <div key={e.id} className="flex items-start gap-2">
            <details className="min-w-0 flex-1 border border-line bg-paper">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1"><span className="font-medium">{e.name}</span> <ExampleFlag show={e.is_example} /><span className="block text-sm text-taupe">+{formatPence(e.price_pence)} · +{e.duration_minutes} min</span></span>
                <StatusBadge status={e.status} />
                <span className="text-sm text-taupe">Edit</span>
              </summary>
              <div className="border-t border-line p-4">{extraForm(e)}</div>
            </details>
            {mover(e.id, "extras")}
          </div>
        ))}
      </div>
      <div className="mt-4"><Panel title="Add an extra">{extraForm()}</Panel></div>

      <h2 className="mb-3 mt-12 text-lg font-medium">Categories</h2>
      <Panel>
        <ul className="space-y-3">
          {categories.map((c) => (
            <li key={c.id}>
              <ActionForm action={saveCategoryAction} submitLabel="Rename" submitClassName="btn btn-outline min-h-10 px-4" className="flex flex-wrap items-end gap-3 [&>div]:mt-0">
                <input type="hidden" name="id" value={c.id} />
                <label className="sr-only" htmlFor={`cat-${c.id}`}>Category name</label>
                <input id={`cat-${c.id}`} name="name" defaultValue={c.name} className="input max-w-xs" />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveCategoryAction} submitLabel="Add category" resetOnSuccess className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-4 [&>div]:mt-0">
          <label className="sr-only" htmlFor="cat-new">New category name</label>
          <input id="cat-new" name="name" placeholder="New category" className="input max-w-xs" />
        </ActionForm>
      </Panel>
    </>
  );
}
