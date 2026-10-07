"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { api, fieldErrors } from "@/lib/client-api";
import { Field, describedBy } from "@/components/field";

type Step = "email" | "code" | "profile";

/** Passwordless sign-in: email, then a 6-digit code, then (first time only) the client's details. */
export function SignInFlow({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [devNote, setDevNote] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<Step>("email");

  // Move focus to the new step's heading (not on first load, where the email field has focus).
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    heading.current?.focus();
  }, [step]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setErrors({});
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErrors({ email: "Please enter a valid email address." });
    setBusy(true);
    const r = await api<{ loginId: string; delivery: string }>("/api/account/login", { method: "POST", body: JSON.stringify({ action: "send", email: email.trim() }) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLoginId(r.data.loginId);
    setDevNote(r.data.delivery !== "email");
    setCode("");
    setStep("code");
  }

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    setErrors({});
    setError(null);
    if (!/^\d{6}$/.test(code)) return setErrors({ code: "Enter the 6-digit code from the email." });
    setBusy(true);
    const r = await api<{ status: "signed_in" } | { status: "needs_profile"; prefill: { name: string; phone: string; dateOfBirth: string } }>("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ action: "check", loginId, code }),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.body.code === "invalid_code") return setErrors({ code: r.error });
      return setError(r.error);
    }
    if (r.data.status === "signed_in") return finish();
    setName(r.data.prefill.name);
    setPhone(r.data.prefill.phone);
    setDob(r.data.prefill.dateOfBirth);
    setStep("profile");
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setError(null);
    setBusy(true);
    const r = await api<{ status: string }>("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ action: "profile", loginId, name, phone, dateOfBirth: dob }),
    });
    setBusy(false);
    if (!r.ok) {
      const f = fieldErrors(r.body);
      if (Object.keys(f).length) return setErrors(f);
      return setError(r.error);
    }
    finish();
  }

  function finish() {
    setBusy(true);
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="step-enter" key={step}>
      {error && (
        <p role="alert" className="mb-6 border-l-2 border-error bg-paper px-4 py-3 text-sm text-error">{error}</p>
      )}

      {step === "email" && (
        <form onSubmit={send} noValidate className="grid gap-6">
          <div>
            <h2 ref={heading} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Sign in or create an account</h2>
            <p className="mt-3 text-taupe">No password to remember. I&apos;ll email you a 6-digit code.</p>
          </div>
          <Field id="email" label="Email" error={errors.email}>
            <input id="email" type="email" inputMode="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={describedBy("email", false, errors.email)} autoFocus />
          </Field>
          <div>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending code" : "Email me a code"}</button>
          </div>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={check} noValidate className="grid gap-6">
          <div>
            <button type="button" onClick={() => setStep("email")} className="mb-5 inline-flex items-center gap-2 text-sm text-taupe hover:text-ink">
              <ArrowLeft size={16} aria-hidden /> Use a different email
            </button>
            <h2 ref={heading} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">Check your inbox</h2>
            <p className="mt-3 text-taupe">I&apos;ve sent a 6-digit code to <strong className="font-medium text-ink">{email.trim()}</strong>. It expires in 15 minutes.</p>
            {devNote && <p className="mt-2 text-sm text-champagne-text">Email delivery isn&apos;t connected on this site yet, so the code is in the admin&apos;s development mailbox.</p>}
          </div>
          <Field id="code" label="Code" error={errors.code}>
            <input
              id="code"
              className="input w-48 text-center text-xl tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!errors.code}
              aria-describedby={describedBy("code", false, errors.code)}
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap items-center gap-5">
            <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? "Checking" : "Continue"}</button>
            <button type="button" className="text-sm text-taupe underline underline-offset-4 hover:text-ink" onClick={() => void send()} disabled={busy}>
              Send a new code
            </button>
          </div>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={saveProfile} noValidate className="grid gap-6">
          <div>
            <h2 ref={heading} tabIndex={-1} className="display text-3xl outline-none md:text-4xl">A few details</h2>
            <p className="mt-3 text-taupe">Saved to your account so booking next time takes seconds.</p>
          </div>
          <Field id="name" label="Full name" error={errors.name}>
            <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={describedBy("name", false, errors.name)} />
          </Field>
          <Field id="phone" label="Mobile number" help="Only used if I need to reach you about an appointment." error={errors.phone}>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby={describedBy("phone", true, errors.phone)} />
          </Field>
          <Field id="dateOfBirth" label="Date of birth" help="Kept private, never shown on the website." error={errors.dateOfBirth}>
            <input id="dateOfBirth" type="date" autoComplete="bday" className="input" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} aria-invalid={!!errors.dateOfBirth} aria-describedby={describedBy("dateOfBirth", true, errors.dateOfBirth)} />
          </Field>
          <Field id="acc-email" label="Email">
            <input id="acc-email" className="input bg-cream/50 text-taupe" value={email.trim()} readOnly />
          </Field>
          <div>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving" : "Create my account"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
