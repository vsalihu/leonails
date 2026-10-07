"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, fieldErrors } from "@/lib/client-api";
import { Field, describedBy } from "@/components/field";

export function ProfileForm({ initial, email }: { initial: { name: string; phone: string; dateOfBirth: string }; email: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV({ ...v, [k]: e.target.value });
    setStatus(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const r = await api("/api/account/profile", { method: "POST", body: JSON.stringify(v) });
    setBusy(false);
    if (!r.ok) {
      const f = fieldErrors(r.body);
      if (Object.keys(f).length) return setErrors(f);
      return setStatus(r.error);
    }
    setStatus("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-5">
      <Field id="p-name" label="Full name" error={errors.name}>
        <input id="p-name" className="input" autoComplete="name" value={v.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={describedBy("p-name", false, errors.name)} />
      </Field>
      <Field id="p-phone" label="Mobile number" error={errors.phone}>
        <input id="p-phone" type="tel" inputMode="tel" autoComplete="tel" className="input" value={v.phone} onChange={set("phone")} aria-invalid={!!errors.phone} aria-describedby={describedBy("p-phone", false, errors.phone)} />
      </Field>
      <Field id="p-dob" label="Date of birth" error={errors.dateOfBirth}>
        <input id="p-dob" type="date" autoComplete="bday" className="input" value={v.dateOfBirth} onChange={set("dateOfBirth")} aria-invalid={!!errors.dateOfBirth} aria-describedby={describedBy("p-dob", false, errors.dateOfBirth)} />
      </Field>
      <Field id="p-email" label="Email" help="To use a different email, sign out and sign in with it.">
        <input id="p-email" className="input bg-cream/50 text-taupe" value={email} readOnly aria-describedby="p-email-help" />
      </Field>
      <div className="flex items-center gap-4">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving" : "Save details"}</button>
        <p role="status" className="text-sm text-taupe">{status}</p>
      </div>
    </form>
  );
}
