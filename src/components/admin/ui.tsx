import Link from "next/link";

export function PageHeader({ title, children, back }: { title: string; children?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-8">
      {back && (
        <Link href={back.href} className="mb-3 inline-block text-sm text-taupe hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl md:text-4xl">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </header>
  );
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-ink text-ink",
  completed: "border-success text-success",
  cancelled: "border-taupe text-taupe line-through decoration-1",
  no_show: "border-error text-error",
  pending: "border-champagne-text text-champagne-text",
  approved: "border-success text-success",
  rejected: "border-taupe text-taupe",
  hidden: "border-taupe text-taupe",
  sent: "border-success text-success",
  captured: "border-champagne-text text-champagne-text",
  failed: "border-error text-error",
  processing: "border-ink text-ink",
  skipped: "border-taupe text-taupe",
  active: "border-success text-success",
  inactive: "border-taupe text-taupe",
  archived: "border-taupe text-taupe",
  disabled: "border-taupe text-taupe",
  scheduled: "border-champagne-text text-champagne-text",
  expired: "border-taupe text-taupe",
};
const STATUS_TEXT: Record<string, string> = { no_show: "No-show", captured: "Captured (not sent)" };

/** Status is always shown as text, with colour as a secondary cue. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "border-taupe text-taupe"}`}>
      {STATUS_TEXT[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}

export function Panel({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-paper ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-5">
          <h2 className="font-medium">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-taupe">{children}</p>;
}

export function ExampleFlag({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="border border-champagne-text px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-champagne-text">Example</span>;
}
