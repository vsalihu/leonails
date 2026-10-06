"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const errs: Record<string, string> = {};
    if (String(payload.name ?? "").trim().length < 2) errs.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email ?? "").trim())) errs.email = "Please enter a valid email address.";
    if (String(payload.message ?? "").trim().length < 10) errs.message = "Please write a little more so I can help.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setErrors(body.fields ?? {});
        setMessage(body.error ?? "Your message couldn't be sent. Please try again.");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
      setMessage("We couldn't reach the server. Check your connection and try again; your message is still here.");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex items-start gap-4 border border-success/30 bg-paper p-6" role="status">
        <CheckCircle size={30} weight="light" className="success-mark shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-lg font-medium">Thank you, your message has been received.</p>
          <p className="mt-1 text-taupe">I&apos;ll reply by email, usually within a day or two.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-xl gap-6">
      <div aria-live="assertive">{message && <p role="alert" className="border-l-2 border-error bg-paper px-4 py-3 text-error">{message}</p>}</div>
      {[
        { id: "name", label: "Name", type: "text", auto: "name" },
        { id: "email", label: "Email", type: "email", auto: "email" },
        { id: "phone", label: "Phone (optional)", type: "tel", auto: "tel" },
      ].map((f) => (
        <div key={f.id} className="grid gap-2">
          <label htmlFor={`c-${f.id}`} className="field-label">{f.label}</label>
          <input id={`c-${f.id}`} name={f.id} type={f.type} autoComplete={f.auto} className="input" aria-invalid={!!errors[f.id]} aria-describedby={errors[f.id] ? `c-${f.id}-error` : undefined} />
          {errors[f.id] && <p id={`c-${f.id}-error`} className="field-error">{errors[f.id]}</p>}
        </div>
      ))}
      <div className="grid gap-2">
        <label htmlFor="c-message" className="field-label">Message</label>
        <textarea id="c-message" name="message" rows={6} className="input min-h-36" maxLength={3000} aria-invalid={!!errors.message} aria-describedby={errors.message ? "c-message-error" : undefined} />
        {errors.message && <p id="c-message-error" className="field-error">{errors.message}</p>}
      </div>
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending" : "Send message"}</button>
      </div>
    </form>
  );
}
