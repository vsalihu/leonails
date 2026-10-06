import "server-only";
import postgres from "postgres";
import { env } from "./env";

type Types = { bigint: number };
type Sql = postgres.Sql<Types>;
export type Tx = postgres.TransactionSql<Types>;
export type Db = Sql | Tx;

const globalForDb = globalThis as unknown as { __sql?: Sql };

export function sql(): Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      // int8 (bigserial ids, counts) parsed to JS numbers; values here stay far below 2^53.
      types: {
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
      transform: { undefined: null },
    });
  }
  return globalForDb.__sql!;
}

/** Postgres error helper. */
export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_SERIALIZATION_FAILURE = "40001";
