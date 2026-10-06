"use client";

import { createContext, startTransition, use, useActionState, useEffect, useId, useRef } from "react";
import type { ActionState } from "@/lib/server/action";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
  hideSubmit?: boolean;
  id?: string;
};

/**
 * Server-action form with pending, error and success states announced to
 * assistive tech. Submits via a transition instead of the form `action` prop so
 * React does not reset the fields: on a validation error the admin keeps what
 * they typed.
 */
export function ActionForm({ action, children, submitLabel = "Save", pendingLabel = "Saving", className = "", confirm, resetOnSuccess, submitClassName = "btn btn-primary", hideSubmit, id }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      id={id}
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <FieldErrorsContext value={state?.fieldErrors ?? {}}>{children}</FieldErrorsContext>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {!hideSubmit && (
          <button type="submit" className={submitClassName} disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </button>
        )}
        <p aria-live="polite" role={state && !state.ok ? "alert" : undefined} className={`text-sm ${state?.ok ? "text-success" : "text-error"}`}>
          {state?.message}
        </p>
      </div>
    </form>
  );
}

const FieldErrors = createContext<Record<string, string>>({});
function FieldErrorsContext({ value, children }: { value: Record<string, string>; children: React.ReactNode }) {
  return <FieldErrors value={value}>{children}</FieldErrors>;
}

/**
 * Label + control + help + error. The control sits inside the <label>, so the
 * association works without ids (several forms on one page share field names,
 * and children rendered on the server can't be cloned here). aria-invalid and
 * aria-describedby are applied to the control after render.
 */
export function AField({ name, label, help, children, className = "" }: { name: string; label: string; help?: string; children: React.ReactNode; className?: string }) {
  const errors = use(FieldErrors);
  const err = errors[name];
  const id = useId();
  const ref = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    const control = ref.current?.querySelector<HTMLElement>("input, select, textarea");
    if (!control) return;
    const describedBy = [help && `${id}-help`, err && `${id}-error`].filter(Boolean).join(" ");
    if (describedBy) control.setAttribute("aria-describedby", describedBy);
    else control.removeAttribute("aria-describedby");
    if (err) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  }, [err, help, id]);
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <label ref={ref} className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {help && <p id={`${id}-help`} className="text-xs text-taupe">{help}</p>}
      {err && <p id={`${id}-error`} className="text-xs text-error" role="alert">{err}</p>}
    </div>
  );
}
