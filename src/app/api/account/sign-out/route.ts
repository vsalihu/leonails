import { signOut } from "@/lib/server/customer-auth";
import { assertSameOrigin, errorJson } from "@/lib/server/http";
import { env } from "@/lib/server/env";

/** POST /api/account/sign-out (a plain form post): ends this device's session. */
export async function POST() {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  await signOut();
  return Response.redirect(new URL("/", env().APP_URL), 303);
}
