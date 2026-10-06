"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarBlank, CaretLeft, CaretRight, Check, Clock, Tag } from "@phosphor-icons/react";
import { formatDuration, formatPence } from "@/lib/money";
import type { Quote } from "@/lib/pricing";

export type FlowExtra = { id: number; name: string; description: string; pricePence: number; durationMinutes: number };
export type FlowTreatment = {
  id: number;
  slug: string;
  name: string;
  description: string;
  notes: string | null;
  pricePence: number;
  durationMinutes: number;
  category: string | null;
  extras: FlowExtra[];
};

type Slot = { startsAt: string; endsAt: string; label: string };
type Day = { date: string; slots: number };
type Hold = { publicId: string; startsAt: string; endsAt: string; expiresAt: string; verified: boolean; email: string | null };
type Step = "treatment" | "time" | "details" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "treatment", label: "Treatment" },
  { id: "time", label: "Time" },
  { id: "details", label: "Details" },
  { id: "review", label: "Confirm" },
];

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: body.error ?? "Something went wrong. Please try again.", body };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again.", body: {} };
  }
}

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function BookingFlow(props: {
  treatments: FlowTreatment[];
  initialTreatmentSlug: string | null;
  timezone: string;
  holdMinutes: number;
}) {
  const { treatments, timezone } = props;
  const router = useRouter();
  const initial = treatments.find((t) => t.slug === props.initialTreatmentSlug) ?? null;

  const [step, setStep] = useState<Step>(initial ? "time" : "treatment");
  const [treatmentId, setTreatmentId] = useState<number | null>(initial?.id ?? null);
  const [extraIds, setExtraIds] = useState<number[]>([]);
  const [days, setDays] = useState<Day[] | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null); // YYYY-MM
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdBusy, setHoldBusy] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Slot[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [codeSent, setCodeSent] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteNote, setQuoteNote] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [idempotencyKey] = useState(uuid);

  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const treatment = treatments.find((t) => t.id === treatmentId) ?? null;
  const chosenExtras = treatment ? treatment.extras.filter((e) => extraIds.includes(e.id)) : [];
  const duration = (treatment?.durationMinutes ?? 0) + chosenExtras.reduce((s, e) => s + e.durationMinutes, 0);
  const subtotal = (treatment?.pricePence ?? 0) + chosenExtras.reduce((s, e) => s + e.pricePence, 0);

  const fmtDay = useMemo(() => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }), [timezone]);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone }), [timezone]);
  const dayLabel = (d: string) => fmtDay.format(new Date(`${d}T12:00:00Z`));

  // Move focus to the step heading for keyboard and screen reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Countdown tick while a hold is live; releases the checkout when it runs out.
  const onExpireRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!hold) return;
    const expiresAt = new Date(hold.expiresAt).getTime();
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= expiresAt) {
        clearInterval(t);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [hold]);
  const remaining = hold ? Math.max(0, new Date(hold.expiresAt).getTime() - now) : 0;

  const loadDays = useCallback(async () => {
    if (!treatmentId) return;
    const r = await api<{ bookingsEnabled: boolean; days: Day[] }>(`/api/booking/availability?treatment=${treatmentId}&extras=${extraIds.join(",")}`);
    if (!r.ok) return setDaysError(r.error);
    setDaysError(null);
    if (!r.data.bookingsEnabled) return setDaysError("Online booking is paused at the moment. Please get in touch to arrange an appointment.");
    setDays(r.data.days);
    const firstOpen = r.data.days.find((d) => d.slots > 0);
    setMonth((m) => m ?? (firstOpen ?? r.data.days[0])?.date.slice(0, 7) ?? null);
    if (date && !r.data.days.find((d) => d.date === date && d.slots > 0)) {
      setDate(null);
      setSlots(null);
    }
  }, [treatmentId, extraIds, date]);

  const loadSlots = useCallback(
    async (d: string) => {
      if (!treatmentId) return;
      setSlotsLoading(true);
      setSlots(null);
      const r = await api<{ slots: Slot[] }>(`/api/booking/availability?treatment=${treatmentId}&extras=${extraIds.join(",")}&date=${d}`);
      setSlotsLoading(false);
      if (!r.ok) return setError(r.error);
      setSlots(r.data.slots);
    },
    [treatmentId, extraIds],
  );

  useEffect(() => {
    onExpireRef.current = () => {
      if (step === "time" || step === "treatment") {
        setHold(null);
        return;
      }
      setError(`Your reserved time has been released because the ${props.holdMinutes} minutes ran out. Please choose a time again; your details are kept.`);
      setHold(null);
      setCodeSent(false);
      setCode("");
      setStep("time");
      setDays(null);
      void loadDays();
    };
  });

  // Initial load when arriving with a preselected treatment.
  useEffect(() => {
    // Data fetch on mount: state is only set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) void loadDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: Step) {
    setError(null);
    setStep(next);
    if (next === "time") {
      setDays(null);
      setDaysError(null);
      void loadDays();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function chooseSlot(slot: Slot) {
    setError(null);
    setAlternatives([]);
    setHoldBusy(slot.startsAt);
    const r = await api<{ hold: Hold }>("/api/booking/hold", {
      method: "POST",
      body: JSON.stringify({ treatmentId, extraIds, startsAt: slot.startsAt }),
    });
    setHoldBusy(null);
    if (!r.ok) {
      setError(r.error);
      const alts = (r.body.alternatives as Slot[] | undefined) ?? [];
      setAlternatives(alts);
      if (date) void loadSlots(date);
      return;
    }
    // A new hold needs its own verification.
    if (!hold || hold.email !== r.data.hold.email) {
      setCodeSent(false);
      setCode("");
    }
    setHold(r.data.hold);
    setNow(Date.now());
    go("details");
  }

  async function releaseAndBack() {
    await api("/api/booking/hold", { method: "DELETE" });
    setHold(null);
    setCodeSent(false);
    setCode("");
    go("time");
  }

  function validateDetails() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Please enter a valid email address.";
    if (!/^[+\d][\d\s()-]{6,}$/.test(phone.trim())) e.phone = "Please enter a phone number we can reach you on.";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function sendCode() {
    if (!hold || !validateDetails()) return;
    setBusy(true);
    setError(null);
    const r = await api<{ sent: boolean; expiresAt: string; delivery: string }>("/api/booking/verify", {
      method: "POST",
      body: JSON.stringify({ action: "send", holdId: hold.publicId, email: email.trim() }),
    });
    setBusy(false);
    if (!r.ok) return handleHoldError(r);
    setCodeSent(true);
    setHold({ ...hold, email: email.trim().toLowerCase(), verified: false });
    setDeliveryNote(
      r.data.delivery === "email"
        ? null
        : "Email delivery isn't connected on this site yet, so the code was captured in the admin's development mailbox instead of being sent.",
    );
  }

  async function checkCode() {
    if (!hold) return;
    if (!/^\d{6}$/.test(code.trim())) return setFieldErrors({ code: "Enter the 6-digit code from the email." });
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await api<{ verified: boolean }>("/api/booking/verify", {
      method: "POST",
      body: JSON.stringify({ action: "check", holdId: hold.publicId, code: code.trim() }),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.body.code === "invalid_code") return setFieldErrors({ code: r.error });
      return handleHoldError(r);
    }
    setHold({ ...hold, verified: true });
    await refreshQuote(appliedPromo);
    go("review");
  }

  function handleHoldError(r: { status: number; error: string; body: Record<string, unknown> }) {
    setError(r.error);
    if (r.body.code === "hold_expired") {
      setHold(null);
      setCodeSent(false);
      go("time");
    }
  }

  async function refreshQuote(promoCode: string | null) {
    if (!treatmentId) return null;
    const r = await api<{ quote: Quote }>("/api/booking/quote", {
      method: "POST",
      body: JSON.stringify({ treatmentId, extraIds, startsAt: hold?.startsAt, code: promoCode, holdId: hold?.publicId }),
    });
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setQuote(r.data.quote);
    return r.data.quote;
  }

  async function applyPromo() {
    setQuoteNote(null);
    const q = await refreshQuote(promo.trim() || null);
    if (!q) return;
    if (q.codeResult?.ok) {
      setAppliedPromo(promo.trim());
      setQuoteNote(`${q.codeResult.message} Your new total is ${formatPence(q.totalPence)}.`);
    } else {
      setAppliedPromo(null);
      setQuoteNote(q.codeResult?.message ?? null);
    }
  }

  async function removePromo() {
    setPromo("");
    setAppliedPromo(null);
    setQuoteNote(null);
    await refreshQuote(null);
  }

  async function confirm() {
    if (!hold || !quote) return;
    if (!accepted) return setFieldErrors({ accepted: "Please confirm you've read the booking terms and cancellation policy." });
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await api<{ reference: string; manageUrl: string }>("/api/booking/confirm", {
      method: "POST",
      body: JSON.stringify({
        holdId: hold.publicId,
        idempotencyKey,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim() || null,
        code: appliedPromo,
        expectedTotalPence: quote.totalPence,
        acceptedTerms: true,
      }),
    });
    if (!r.ok) {
      setBusy(false);
      if (r.body.code === "price_changed" && r.body.quote) {
        setQuote(r.body.quote as Quote);
        if (!(r.body.quote as Quote).applied) setAppliedPromo(null);
        setError(`${r.error} ${(r.body.quote as Quote).codeResult?.message ?? ""}`.trim());
        return;
      }
      if (r.body.fields) setFieldErrors(r.body.fields as Record<string, string>);
      return handleHoldError(r);
    }
    router.push(r.data.manageUrl);
  }

  // ---------------------------------------------------------------- render

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const minutesLeft = Math.floor(remaining / 60000);
  const secondsLeft = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
      <div className="min-w-0">
        <nav aria-label="Booking progress" className="mb-10">
          <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s.id} className={`flex items-center gap-2 ${i === stepIndex ? "text-ink" : i < stepIndex ? "text-taupe" : "text-taupe/70"}`} aria-current={i === stepIndex ? "step" : undefined}>
                <span
                  aria-hidden
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[0.7rem] ${i < stepIndex ? "border-ink bg-ink text-ivory" : i === stepIndex ? "border-ink" : "border-line-strong/60"}`}
                >
                  {i < stepIndex ? <Check size={12} weight="bold" /> : i + 1}
                </span>
                <span className={i === stepIndex ? "font-medium" : ""}>{s.label}</span>
                {i < stepIndex && <span className="sr-only">(completed)</span>}
              </li>
            ))}
          </ol>
        </nav>

        <div aria-live="assertive" className="empty:hidden">
          {error && (
            <div role="alert" className="mb-8 border-l-2 border-error bg-paper px-4 py-3 text-[0.95rem] text-error">
              {error}
            </div>
          )}
        </div>

        <div key={step} className="step-enter">
          {step === "treatment" && (
            <section aria-labelledby="h-treatment">
              <h2 id="h-treatment" ref={headingRef} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Choose your treatment</h2>
              <fieldset className="mt-8">
                <legend className="sr-only">Treatment</legend>
                <div className="divide-y divide-line border-y border-line">
                  {treatments.map((t) => (
                    <label key={t.id} className={`flex cursor-pointer gap-4 py-5 transition-colors ${treatmentId === t.id ? "bg-paper" : "hover:bg-paper/60"} px-3`}>
                      <input
                        type="radio"
                        name="treatment"
                        className="mt-1.5 h-4 w-4 accent-[var(--color-ink)]"
                        checked={treatmentId === t.id}
                        onChange={() => {
                          setTreatmentId(t.id);
                          setExtraIds([]);
                          setDate(null);
                          setSlots(null);
                          setMonth(null);
                        }}
                      />
                      <span className="grid flex-1 grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                        <span className="text-lg font-medium">{t.name}</span>
                        <span className="text-lg tabular-nums">{formatPence(t.pricePence)}</span>
                        <span className="text-sm text-taupe">{t.description}</span>
                        <span className="text-right text-sm text-taupe">{formatDuration(t.durationMinutes)}</span>
                        {t.notes && <span className="col-span-2 text-sm text-champagne-text">{t.notes}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {treatment && treatment.extras.length > 0 && (
                <fieldset className="mt-10">
                  <legend className="text-lg font-medium">Add extras <span className="font-normal text-taupe">(optional)</span></legend>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {treatment.extras.map((e) => {
                      const on = extraIds.includes(e.id);
                      return (
                        <label key={e.id} className={`flex cursor-pointer gap-3 border p-4 transition-colors ${on ? "border-ink bg-paper" : "border-line hover:border-line-strong"}`}>
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
                            checked={on}
                            onChange={() => {
                              setExtraIds((ids) => (on ? ids.filter((x) => x !== e.id) : [...ids, e.id]));
                              setDate(null);
                              setSlots(null);
                            }}
                          />
                          <span className="flex-1">
                            <span className="flex justify-between gap-3 font-medium">
                              <span>{e.name}</span>
                              <span className="tabular-nums">+{formatPence(e.pricePence)}</span>
                            </span>
                            <span className="mt-1 block text-sm text-taupe">{e.description}</span>
                            {e.durationMinutes > 0 && <span className="mt-1 block text-sm text-taupe">Adds {formatDuration(e.durationMinutes)}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button type="button" className="btn btn-primary" disabled={!treatment} onClick={() => go("time")}>
                  Choose a time
                </button>
                {!treatment && <p className="text-sm text-taupe">Select a treatment to continue.</p>}
              </div>
            </section>
          )}

          {step === "time" && treatment && (
            <section aria-labelledby="h-time">
              <button type="button" onClick={() => go("treatment")} className="mb-6 inline-flex items-center gap-2 text-sm text-taupe hover:text-ink">
                <ArrowLeft size={16} aria-hidden /> Change treatment
              </button>
              <h2 id="h-time" ref={headingRef} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Choose a day and time</h2>
              <p className="mt-3 text-taupe">
                Showing times for {formatDuration(duration)} of treatment. Times are UK time.
              </p>

              {daysError ? (
                <div className="mt-8 border border-line bg-paper p-6">
                  <p>{daysError}</p>
                  <button type="button" className="btn btn-outline mt-4" onClick={() => { setDaysError(null); setDays(null); void loadDays(); }}>Try again</button>
                </div>
              ) : !days ? (
                <CalendarSkeleton />
              ) : days.every((d) => d.slots === 0) ? (
                <div className="mt-8 border border-line bg-paper p-6">
                  <p className="font-medium">No times are available for this treatment in the next few weeks.</p>
                  <p className="mt-2 text-taupe">Try a shorter combination of extras, or get in touch and I&apos;ll do my best to fit you in.</p>
                  <Link href="/contact" className="btn btn-outline mt-5">Ask about availability</Link>
                </div>
              ) : (
                <MonthCalendar
                  days={days}
                  month={month ?? days[0].date.slice(0, 7)}
                  onMonth={setMonth}
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setAlternatives([]);
                    void loadSlots(d);
                  }}
                />
              )}

              {date && (
                <div className="mt-10" aria-live="polite">
                  <h3 className="text-lg font-medium">{dayLabel(date)}</h3>
                  {slotsLoading || !slots ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-hidden>
                      {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-12 animate-pulse bg-cream" />)}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="mt-3 text-taupe">This day has just filled up. Please choose another day.</p>
                  ) : (
                    <SlotGroups slots={slots} busyStart={holdBusy} selected={hold?.startsAt ?? null} onChoose={chooseSlot} />
                  )}
                </div>
              )}

              {alternatives.length > 0 && (
                <div className="mt-8 border border-line bg-paper p-5">
                  <p className="font-medium">Nearby times that are still free</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {alternatives.map((s) => (
                      <button key={s.startsAt} type="button" className="btn btn-outline min-h-11 px-4" onClick={() => chooseSlot(s)}>
                        {dayLabel(new Date(s.startsAt).toLocaleDateString("en-CA", { timeZone: timezone })).split(" ").slice(0, 3).join(" ")}, {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {step === "details" && hold && (
            <section aria-labelledby="h-details">
              <button type="button" onClick={releaseAndBack} className="mb-6 inline-flex items-center gap-2 text-sm text-taupe hover:text-ink">
                <ArrowLeft size={16} aria-hidden /> Choose a different time
              </button>
              <h2 id="h-details" ref={headingRef} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Your details</h2>
              <HoldNotice minutes={minutesLeft} seconds={secondsLeft} until={fmtTime.format(new Date(hold.expiresAt))} />

              <div className="mt-8 grid max-w-xl gap-6">
                <Field id="name" label="Full name" error={fieldErrors.name}>
                  <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-error" : undefined} />
                </Field>
                <Field id="email" label="Email" help="We'll send a 6-digit code to confirm it's you, then your confirmation." error={fieldErrors.email}>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    className="input"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (codeSent) {
                        setCodeSent(false);
                        setCode("");
                      }
                    }}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={`email-help${fieldErrors.email ? " email-error" : ""}`}
                  />
                </Field>
                <Field id="phone" label="Mobile number" help="Only used if I need to reach you about your appointment." error={fieldErrors.phone}>
                  <input id="phone" type="tel" inputMode="tel" className="input" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!fieldErrors.phone} aria-describedby={`phone-help${fieldErrors.phone ? " phone-error" : ""}`} />
                </Field>
                <Field id="notes" label="Anything I should know? (optional)" help="Inspiration, allergies or a nail you've damaged.">
                  <textarea id="notes" rows={3} className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} aria-describedby="notes-help" />
                </Field>

                {!codeSent ? (
                  <div>
                    <button type="button" className="btn btn-primary" onClick={sendCode} disabled={busy}>
                      {busy ? "Sending code" : "Send my code"}
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-line pt-6">
                    <p className="text-[0.95rem]">We&apos;ve sent a 6-digit code to <strong className="font-medium">{email.trim()}</strong>.</p>
                    {deliveryNote && <p className="mt-2 text-sm text-champagne-text">{deliveryNote}</p>}
                    <div className="mt-5 flex flex-wrap items-end gap-3">
                      <Field id="code" label="Code" error={fieldErrors.code}>
                        <input
                          id="code"
                          className="input w-40 text-center text-lg tracking-[0.3em]"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => e.key === "Enter" && void checkCode()}
                          aria-invalid={!!fieldErrors.code}
                          aria-describedby={fieldErrors.code ? "code-error" : undefined}
                        />
                      </Field>
                      <button type="button" className="btn btn-primary" onClick={checkCode} disabled={busy || code.length !== 6}>
                        {busy ? "Checking" : "Continue"}
                      </button>
                    </div>
                    <button type="button" className="mt-4 text-sm text-taupe underline underline-offset-4 hover:text-ink" onClick={sendCode} disabled={busy}>
                      Send a new code
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {step === "review" && hold && treatment && (
            <section aria-labelledby="h-review">
              <button type="button" onClick={() => go("details")} className="mb-6 inline-flex items-center gap-2 text-sm text-taupe hover:text-ink">
                <ArrowLeft size={16} aria-hidden /> Edit details
              </button>
              <h2 id="h-review" ref={headingRef} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Check and confirm</h2>
              <HoldNotice minutes={minutesLeft} seconds={secondsLeft} until={fmtTime.format(new Date(hold.expiresAt))} />

              <dl className="mt-8 grid max-w-xl grid-cols-[auto_1fr] gap-x-8 gap-y-3 border-y border-line py-6 text-[0.95rem]">
                <dt className="text-taupe">When</dt>
                <dd>{dayLabel(new Date(hold.startsAt).toLocaleDateString("en-CA", { timeZone: timezone }))}, {fmtTime.format(new Date(hold.startsAt))} to {fmtTime.format(new Date(hold.endsAt))}</dd>
                <dt className="text-taupe">Name</dt>
                <dd>{name}</dd>
                <dt className="text-taupe">Email</dt>
                <dd className="break-all">{email}</dd>
                <dt className="text-taupe">Phone</dt>
                <dd>{phone}</dd>
              </dl>

              <div className="mt-8 max-w-xl">
                <label htmlFor="promo" className="field-label">Offer code <span className="font-normal text-taupe">(optional)</span></label>
                <div className="mt-2 flex gap-2">
                  <input id="promo" className="input uppercase" value={promo} onChange={(e) => setPromo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void applyPromo()} aria-describedby="promo-note" autoCapitalize="characters" />
                  {appliedPromo ? (
                    <button type="button" className="btn btn-outline shrink-0" onClick={removePromo}>Remove</button>
                  ) : (
                    <button type="button" className="btn btn-outline shrink-0" onClick={applyPromo} disabled={!promo.trim()}>Apply</button>
                  )}
                </div>
                <p id="promo-note" aria-live="polite" className={`mt-2 text-sm ${quote?.codeResult?.ok ? "text-success" : "text-taupe"}`}>{quoteNote}</p>
              </div>

              <div className="mt-8 max-w-xl">
                <label className="flex gap-3 text-[0.95rem]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-ink)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} aria-invalid={!!fieldErrors.accepted} aria-describedby={fieldErrors.accepted ? "accepted-error" : undefined} />
                  <span>
                    I&apos;ve read the{" "}
                    <Link href="/policies/booking-terms" target="_blank" className="underline underline-offset-4">booking terms</Link> and{" "}
                    <Link href="/policies/cancellation" target="_blank" className="underline underline-offset-4">cancellation policy</Link>.
                  </span>
                </label>
                {fieldErrors.accepted && <p id="accepted-error" className="field-error mt-2">{fieldErrors.accepted}</p>}
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
                <button type="button" className="btn btn-primary min-w-56" onClick={confirm} disabled={busy || !quote}>
                  {busy ? "Confirming" : "Confirm appointment"}
                </button>
                <p className="text-sm">
                  <span className="font-medium tabular-nums">{quote ? formatPence(quote.totalPence) : formatPence(subtotal)}</span>{" "}
                  <span className="text-taupe">Pay at your appointment</span>
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      <Summary
        treatment={treatment}
        extras={chosenExtras}
        duration={duration}
        subtotal={subtotal}
        quote={step === "review" ? quote : null}
        when={hold ? `${dayLabel(new Date(hold.startsAt).toLocaleDateString("en-CA", { timeZone: timezone }))}, ${fmtTime.format(new Date(hold.startsAt))}` : null}
      />
    </div>
  );
}

function Field({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {help && <p id={`${id}-help`} className="field-help">{help}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}

function HoldNotice({ minutes, seconds, until }: { minutes: number; seconds: number; until: string }) {
  const low = minutes < 2;
  return (
    <p className={`mt-4 inline-flex items-center gap-2 text-sm ${low ? "text-error" : "text-taupe"}`}>
      <Clock size={16} aria-hidden />
      <span>
        Your time is reserved until {until}{" "}
        <span className="tabular-nums" aria-hidden>({minutes}:{String(seconds).padStart(2, "0")} left)</span>
      </span>
    </p>
  );
}

function Summary(props: { treatment: FlowTreatment | null; extras: FlowExtra[]; duration: number; subtotal: number; quote: Quote | null; when: string | null }) {
  const { treatment, extras, quote } = props;
  return (
    <aside aria-label="Booking summary" className="lg:sticky lg:top-28 lg:self-start">
      <div className="border border-line bg-paper">
        <div className="leopard-light h-2" aria-hidden />
        <div className="p-6">
          <h2 className="display text-2xl">Your appointment</h2>
          {!treatment ? (
            <p className="mt-4 text-sm text-taupe">Choose a treatment to see the price and time needed.</p>
          ) : (
            <>
              <ul className="mt-5 space-y-2 text-[0.95rem]">
                <li className="flex justify-between gap-4"><span>{treatment.name}</span><span className="tabular-nums">{formatPence(treatment.pricePence)}</span></li>
                {extras.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 text-taupe"><span>{e.name}</span><span className="tabular-nums">+{formatPence(e.pricePence)}</span></li>
                ))}
              </ul>
              {quote?.applied && (
                <p className="mt-3 flex justify-between gap-4 text-[0.95rem] text-success">
                  <span className="inline-flex items-center gap-1.5"><Tag size={14} aria-hidden />{quote.applied.name}</span>
                  <span className="tabular-nums">-{formatPence(quote.discountPence)}</span>
                </p>
              )}
              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-line pt-4">
                <span className="font-medium">Total</span>
                <span className="text-xl tabular-nums">{formatPence(quote ? quote.totalPence : props.subtotal)}</span>
              </div>
              <p className="mt-1 text-right text-sm text-taupe">Pay at your appointment</p>
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex items-center gap-2"><dt className="sr-only">Time needed</dt><Clock size={16} aria-hidden className="text-taupe" /><dd>{formatDuration(props.duration)}</dd></div>
                {props.when && <div className="flex items-center gap-2"><dt className="sr-only">When</dt><CalendarBlank size={16} aria-hidden className="text-taupe" /><dd>{props.when}</dd></div>}
              </dl>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-taupe">The appointment address in Wisbech is shared once your booking is confirmed.</p>
    </aside>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="mt-8 max-w-md" aria-label="Loading available days" role="status">
      <div className="h-6 w-40 animate-pulse bg-cream" />
      <div className="mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-cream/70" />)}
      </div>
    </div>
  );
}

export function MonthCalendar(props: { days: Day[]; month: string; onMonth: (m: string) => void; selected: string | null; onSelect: (d: string) => void }) {
  const { days, month } = props;
  const byDate = new Map(days.map((d) => [d.date, d.slots]));
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const mi = months.indexOf(month);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mt-8 max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium" aria-live="polite">{title}</h3>
        <div className="flex gap-1">
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center border border-line disabled:opacity-40" disabled={mi <= 0} onClick={() => props.onMonth(months[mi - 1])}>
            <CaretLeft size={18} aria-hidden /><span className="sr-only">Previous month</span>
          </button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center border border-line disabled:opacity-40" disabled={mi >= months.length - 1} onClick={() => props.onMonth(months[mi + 1])}>
            <CaretRight size={18} aria-hidden /><span className="sr-only">Next month</span>
          </button>
        </div>
      </div>
      <div role="grid" aria-label={`Available days in ${title}`} className="mt-4">
        <div role="row" className="grid grid-cols-7 text-center text-xs text-taupe">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span role="columnheader" key={d} className="py-2" aria-label={d}>{d.slice(0, 2)}</span>
          ))}
        </div>
        <div role="row" className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} role="gridcell" />;
            const n = byDate.get(d) ?? 0;
            const sel = props.selected === d;
            const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
            return (
              <span role="gridcell" key={d}>
                <button
                  type="button"
                  disabled={n === 0}
                  aria-pressed={sel}
                  aria-label={n === 0 ? `${label}, unavailable` : `${label}, ${n} ${n === 1 ? "time" : "times"} available`}
                  onClick={() => props.onSelect(d)}
                  className={`relative flex aspect-square w-full flex-col items-center justify-center text-[0.95rem] transition-colors duration-150 ${
                    sel ? "bg-ink text-ivory" : n === 0 ? "text-taupe/45 line-through decoration-1" : "bg-paper hover:bg-cream"
                  }`}
                >
                  {Number(d.slice(8))}
                  {n > 0 && !sel && <span aria-hidden className="absolute bottom-1.5 h-1 w-1 rounded-full bg-champagne" />}
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-taupe"><span aria-hidden className="h-1 w-1 rounded-full bg-champagne" />Days with available times</p>
    </div>
  );
}

export function SlotGroups({ slots, busyStart, selected, onChoose }: { slots: Slot[]; busyStart: string | null; selected: string | null; onChoose: (s: Slot) => void }) {
  const hour = (s: Slot) => Number(s.label.slice(0, 2));
  const groups = [
    { label: "Morning", items: slots.filter((s) => hour(s) < 12) },
    { label: "Afternoon", items: slots.filter((s) => hour(s) >= 12 && hour(s) < 17) },
    { label: "Evening", items: slots.filter((s) => hour(s) >= 17) },
  ].filter((g) => g.items.length);
  return (
    <div className="mt-5 space-y-6">
      {groups.map((g) => (
        <fieldset key={g.label}>
          <legend className="text-sm text-taupe">{g.label}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6">
            {g.items.map((s) => {
              const isBusy = busyStart === s.startsAt;
              const isSel = selected === s.startsAt;
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  disabled={!!busyStart}
                  aria-pressed={isSel}
                  onClick={() => onChoose(s)}
                  className={`btn min-h-12 px-0 tabular-nums tracking-normal ${isSel ? "btn-primary" : "btn-outline border-line-strong"} ${isBusy ? "animate-pulse" : ""}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
