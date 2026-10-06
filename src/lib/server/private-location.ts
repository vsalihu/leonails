import "server-only";
import { sql, type Db } from "./db";

/**
 * The private appointment address. Only call this from code paths that have
 * already authorised the caller (admin session, or a valid booking token for a
 * confirmed booking, or the email worker sending to that booking's customer).
 */
export async function getPrivateLocation(db: Db = sql()) {
  const [r] = await db`SELECT address_lines, postcode, arrival_instructions, is_example FROM private_location WHERE id = 1`;
  if (!r) return null;
  return {
    addressLines: r.address_lines as string,
    postcode: r.postcode as string | null,
    arrivalInstructions: r.arrival_instructions as string | null,
    isExample: r.is_example as boolean,
  };
}
