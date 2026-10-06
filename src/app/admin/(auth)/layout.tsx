import type { Metadata } from "next";
export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ivory px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="leopard-light mb-8 h-2" aria-hidden />
        {children}
      </div>
    </main>
  );
}
