import { ActionForm, AField } from "@/components/admin/action-form";
import { MIN_PASSWORD } from "@/lib/server/auth";
import { resetAction } from "../../../actions";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="display text-4xl">Choose a new password</h1>
      <ActionForm action={resetAction} submitLabel="Update password" pendingLabel="Updating" className="mt-8 grid gap-5" submitClassName="btn btn-primary w-full">
        <input type="hidden" name="token" value={token} />
        <AField name="password" label="New password" help={`At least ${MIN_PASSWORD} characters.`}><input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} className="input" required /></AField>
        <AField name="confirm" label="Repeat new password"><input name="confirm" type="password" autoComplete="new-password" className="input" required /></AField>
      </ActionForm>
    </>
  );
}
