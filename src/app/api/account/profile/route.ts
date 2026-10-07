import { currentCustomer, updateProfile } from "@/lib/server/customer-auth";
import { profileSchema } from "@/lib/account-schema";
import { assertSameOrigin, errorJson, json, parseJson } from "@/lib/server/http";

/** POST /api/account/profile: the signed-in client updates their details. */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const me = await currentCustomer();
  if (!me) return errorJson("Please sign in again.", 401);
  const data = await parseJson(req, profileSchema);
  if (data instanceof Response) return data;
  await updateProfile(me.id, data);
  return json({ ok: true });
}
