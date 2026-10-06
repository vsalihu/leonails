"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { retryJob, kickWorker } from "@/lib/server/notifications/worker";
import { done, fd, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

export async function retryJobAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  await retryJob(id);
  await audit(sql(), { type: "admin", id: admin.id }, "notification.retried", "notification_job", id);
  kickWorker();
  revalidatePath("/admin/messages");
  return done("Queued to send again.");
}

export async function enquiryStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = fd.int(form, "id")!;
  const status = fd.str(form, "status") === "handled" ? "handled" : "new";
  await sql()`UPDATE enquiries SET status = ${status} WHERE id = ${id}`;
  revalidatePath("/admin/messages");
  return done(status === "handled" ? "Marked as handled." : "Marked as new.");
}
