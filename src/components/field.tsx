/** Label, control, help and error, wired for screen readers by id convention (`${id}-help`, `${id}-error`). */
export function Field({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {help && <p id={`${id}-help`} className="field-help">{help}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}

export function describedBy(id: string, help: boolean, error: string | undefined) {
  return [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}
