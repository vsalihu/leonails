import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, AField } from "@/components/admin/action-form";
import { currentAdmin } from "@/lib/server/auth";
import { loginAction } from "../../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await currentAdmin()) redirect("/admin");
  const { reset } = await searchParams;
  return (
    <>
      <h1 className="display text-4xl">Sign in</h1>
      {reset && <p className="mt-4 text-sm text-success" role="status">Password updated. Please sign in.</p>}
      <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in" className="mt-8 grid gap-5" submitClassName="btn btn-primary w-full">
        <AField name="email" label="Email"><input name="email" type="email" autoComplete="username" className="input" required /></AField>
        <AField name="password" label="Password"><input name="password" type="password" autoComplete="current-password" className="input" required /></AField>
      </ActionForm>
      <Link href="/admin/forgot" className="mt-6 inline-block text-sm text-taupe underline underline-offset-4">Forgotten your password?</Link>
    </>
  );
}
