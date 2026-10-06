"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, requestPasswordReset, resetPassword } from "@/lib/server/auth";
import { fail, type ActionState } from "@/lib/server/action";

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return fail("Enter your email and password.");
  const r = await login(email, password, (await headers()).get("user-agent"));
  if (!r.ok) return fail(r.error);
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function forgotAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requestPasswordReset(String(form.get("email") ?? ""));
  return { ok: true, message: "If that email belongs to an admin account, a reset link is on its way. It expires in one hour." };
}

export async function resetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return fail("The passwords don't match.");
  const r = await resetPassword(String(form.get("token") ?? ""), password);
  if (!r.ok) return fail(r.error);
  redirect("/admin/login?reset=1");
}
