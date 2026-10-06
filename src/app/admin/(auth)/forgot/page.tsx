import Link from "next/link";
import { ActionForm, AField } from "@/components/admin/action-form";
import { forgotAction } from "../../actions";

export default function ForgotPage() {
  return (
    <>
      <h1 className="display text-4xl">Reset password</h1>
      <p className="mt-3 text-sm text-taupe">Enter your admin email and we&apos;ll send a one-time reset link.</p>
      <ActionForm action={forgotAction} submitLabel="Send reset link" pendingLabel="Sending" className="mt-8 grid gap-5" submitClassName="btn btn-primary w-full">
        <AField name="email" label="Email"><input name="email" type="email" autoComplete="username" className="input" required /></AField>
      </ActionForm>
      <Link href="/admin/login" className="mt-6 inline-block text-sm text-taupe underline underline-offset-4">Back to sign in</Link>
    </>
  );
}
