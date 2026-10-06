"use client";

import { useState } from "react";
import { CheckCircle, Star } from "@phosphor-icons/react";

export function ReviewForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("rating", String(rating));
    setState("sending");
    setError(null);
    setErrors({});
    try {
      const res = await fetch(`/api/review/${token}`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("idle");
        setError(body.error ?? "Your review couldn't be sent. Please try again.");
        setErrors(body.fields ?? {});
        return;
      }
      setState("sent");
    } catch {
      setState("idle");
      setError("We couldn't reach the server. Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex items-start gap-4 border border-success/30 bg-paper p-6" role="status">
        <CheckCircle size={30} weight="light" className="success-mark shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-lg font-medium">Thank you for your review.</p>
          <p className="mt-1 text-taupe">I read every review before it appears on the website.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-6" noValidate>
      <div aria-live="assertive">{error && <p role="alert" className="border-l-2 border-error bg-paper px-4 py-3 text-error">{error}</p>}</div>
      <fieldset>
        <legend className="field-label">Your rating</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating === n} aria-label={`${n} out of 5`} onClick={() => setRating(n)} className="inline-flex h-11 w-11 items-center justify-center text-champagne-text">
              <Star size={26} weight={n <= rating ? "fill" : "light"} aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <label htmlFor="r-quote" className="field-label">Your review</label>
        <textarea id="r-quote" name="quote" rows={5} maxLength={600} className="input min-h-32" aria-invalid={!!errors.quote} aria-describedby={errors.quote ? "r-quote-error" : undefined} />
        {errors.quote && <p id="r-quote-error" className="field-error">{errors.quote}</p>}
      </div>
      <div className="grid gap-2">
        <label htmlFor="r-name" className="field-label">Name to show</label>
        <input id="r-name" name="displayName" defaultValue={defaultName} className="input" maxLength={60} aria-describedby="r-name-help" aria-invalid={!!errors.displayName} />
        <p id="r-name-help" className="field-help">A first name is plenty.</p>
        {errors.displayName && <p className="field-error">{errors.displayName}</p>}
      </div>
      <div className="grid gap-2">
        <label htmlFor="r-photo" className="field-label">Photo of your nails (optional)</label>
        <input id="r-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="text-sm file:mr-4 file:border file:border-ink file:bg-transparent file:px-4 file:py-2.5 file:text-sm" aria-describedby="r-photo-help" />
        <p id="r-photo-help" className="field-help">JPEG, PNG, WebP or HEIC, up to 15 MB. Location data is removed from photos.</p>
        {errors.photo && <p className="field-error" role="alert">{errors.photo}</p>}
      </div>
      <label className="flex gap-3 text-[0.95rem]">
        <input type="checkbox" name="consent" value="yes" className="mt-1 h-4 w-4 accent-[var(--color-ink)]" aria-invalid={!!errors.consent} />
        <span>I&apos;m happy for this review{" "}and photo to be published on the website.</span>
      </label>
      {errors.consent && <p className="field-error">{errors.consent}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending" : "Send review"}</button>
      </div>
    </form>
  );
}
