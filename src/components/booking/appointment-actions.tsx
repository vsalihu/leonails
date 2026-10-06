"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, X } from "@phosphor-icons/react";
import { CalendarSkeleton, MonthCalendar, SlotGroups } from "./booking-flow";
import { formatPence } from "@/lib/money";

type Slot = { startsAt: string; endsAt: string; label: string };
type Day = { date: string; slots: number };

export function AppointmentActions({ token, timezone, canChange, cutoffText }: { token: string; timezone: string; canChange: boolean; cutoffText: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [days, setDays] = useState<Day[] | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceCheck, setPriceCheck] = useState<{ slot: Slot; oldTotalPence: number; newTotalPence: number; reason: string } | null>(null);
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!canChange) {
    return (
      <p className="text-taupe">
        Changes can&apos;t be made online within {cutoffText} of your appointment. Please get in touch directly.
      </p>
    );
  }

  async function openReschedule() {
    setMode("reschedule");
    setError(null);
    const r = await fetch(`/api/appointment/${token}/availability`);
    const body = await r.json();
    if (!r.ok) return setError(body.error);
    setDays(body.days);
    const first = (body.days as Day[]).find((d) => d.slots > 0);
    setMonth((first ?? body.days[0])?.date.slice(0, 7) ?? null);
  }

  async function pickDate(d: string) {
    setDate(d);
    setSlots(null);
    const r = await fetch(`/api/appointment/${token}/availability?date=${d}`);
    const body = await r.json();
    if (!r.ok) return setError(body.error);
    setSlots(body.slots);
  }

  async function move(slot: Slot, acceptPriceChange = false) {
    setBusy(slot.startsAt);
    setError(null);
    const r = await fetch(`/api/appointment/${token}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: slot.startsAt, acceptPriceChange }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) {
      setMode("idle");
      setPriceCheck(null);
      router.replace(`/appointment/${token}?moved=1`);
      router.refresh();
      return;
    }
    if (body.needsPriceConfirmation) return setPriceCheck({ slot, ...body.needsPriceConfirmation });
    setError(body.error ?? "We couldn't move your appointment. It has not been changed.");
    if (date) void pickDate(date);
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    const r = await fetch(`/api/appointment/${token}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(body.error ?? "We couldn't cancel your appointment. Please try again.");
    dialogRef.current?.close();
    router.refresh();
  }

  return (
    <div>
      <div aria-live="assertive">{error && <p role="alert" className="mb-6 border-l-2 border-error bg-paper px-4 py-3 text-error">{error}</p>}</div>

      {mode !== "reschedule" ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={openReschedule}>
            <CalendarCheck size={18} aria-hidden /> Change time
          </button>
          <button type="button" className="btn btn-outline" onClick={() => { setMode("cancel"); dialogRef.current?.showModal(); }}>
            Cancel appointment
          </button>
        </div>
      ) : (
        <div className="border-t border-line pt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="display text-2xl">Choose a new time</h2>
            <button type="button" className="inline-flex h-11 items-center gap-2 text-sm text-taupe hover:text-ink" onClick={() => setMode("idle")}>
              <X size={16} aria-hidden /> Keep current time
            </button>
          </div>
          <p className="mt-2 text-sm text-taupe">Your current appointment stays booked until the new time is confirmed.</p>
          {!days ? (
            <CalendarSkeleton />
          ) : (
            <MonthCalendar days={days} month={month ?? days[0].date.slice(0, 7)} onMonth={setMonth} selected={date} onSelect={pickDate} />
          )}
          {date && (slots === null ? <p className="mt-6 text-taupe" role="status">Loading times</p> : slots.length === 0 ? <p className="mt-6 text-taupe">No other times on this day.</p> : <SlotGroups slots={slots} busyStart={busy} selected={null} onChoose={(s) => move(s)} />)}
          {priceCheck && (
            <div className="mt-8 border border-line bg-paper p-5" role="alertdialog" aria-labelledby="price-check-title">
              <p id="price-check-title" className="font-medium">The price changes for this time</p>
              <p className="mt-2 text-[0.95rem] text-taupe">{priceCheck.reason}. The total would change from {formatPence(priceCheck.oldTotalPence)} to {formatPence(priceCheck.newTotalPence)}.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" onClick={() => move(priceCheck.slot, true)} disabled={!!busy}>Move and pay {formatPence(priceCheck.newTotalPence)}</button>
                <button type="button" className="btn btn-outline" onClick={() => setPriceCheck(null)}>Keep current time</button>
              </div>
            </div>
          )}
          <p className="sr-only" aria-live="polite">{timezone}</p>
        </div>
      )}

      <dialog ref={dialogRef} className="m-auto w-[min(92vw,30rem)] bg-ivory p-0 text-ink backdrop:bg-night/60" aria-labelledby="cancel-title" onClose={() => setMode("idle")}>
        <div className="p-6">
          <h2 id="cancel-title" className="display text-2xl">Cancel this appointment?</h2>
          <p className="mt-3 text-taupe">The time will be released for someone else. You can book again whenever you like.</p>
          <label htmlFor="cancel-reason" className="field-label mt-5">Reason <span className="font-normal text-taupe">(optional)</span></label>
          <textarea id="cancel-reason" className="input mt-2 min-h-20" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={cancel} disabled={busy === "cancel"}>{busy === "cancel" ? "Cancelling" : "Yes, cancel it"}</button>
            <button type="button" className="btn btn-outline" onClick={() => dialogRef.current?.close()} autoFocus>Keep my appointment</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
