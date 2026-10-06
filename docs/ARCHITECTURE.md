# Architecture decision record

Status: accepted (initial build). Documentation for each technology was checked against the versions installed in this repository (Next.js docs are bundled in `node_modules/next/dist/docs`).

## Summary

| Concern | Decision | Why |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router), React 19, TypeScript** | One deployable for the public site, booking flow, admin and API. Server Components keep private data on the server by default. |
| Styling / motion | Tailwind CSS 4, Motion (`motion/react`) for parallax only, CSS transitions elsewhere | Small runtime, respects `prefers-reduced-motion`. |
| Fonts | Bodoni Moda (display, optical sizes) and Hanken Grotesk (interface), self-hosted via Fontsource | No third-party font requests; Didone display suits the fashion-editorial brief. |
| Database | **PostgreSQL 14+** (`btree_gist`, `citext`) via the `postgres` driver and hand-written SQL migrations | Exclusion constraints give database-level double-booking protection; transactions and row locks give exact promotion limits. |
| Authentication | Own admin auth: scrypt password hashes, random session tokens (only SHA-256 hashes stored), httpOnly `SameSite=Lax` cookies, password reset by emailed one-time link | One or two admin users; no external identity provider needed. |
| Customer access | Guest booking. Email ownership proven by a 6-digit code before confirmation. Management and review pages use 256-bit random tokens in the URL (hashes stored), with expiry and revocation | No customer accounts, no sequential-ID access. |
| Object storage | `local` driver (persistent volume) or `s3` driver (any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2) | Same API; production can pick either. |
| Images | `sharp`: decode-validate, auto-orient, re-encode to WebP at 480/960/1600/2400 px, **all metadata dropped** (EXIF/GPS/XMP/IPTC) | Location metadata never leaves the server; responsive `srcset`. |
| Email | `smtp` driver (any provider: Resend, Postmark, SES, Mailgun...) or `devmailbox` driver that captures rendered messages in the database | Provider-agnostic; development never pretends to deliver. |
| Background jobs | **Durable outbox** table (`notification_jobs`) with dedupe keys, leases (`FOR UPDATE SKIP LOCKED`), retries with exponential backoff, and a failure state visible in admin. Runs in-process (`WORKER_IN_PROCESS=true`), as a separate `npm run worker` process, or via `POST /api/cron/run-jobs` | Emails commit atomically with bookings; nothing is lost if the provider is down; works on a single VPS or with an external scheduler. |
| Rate limiting | Fixed-window counters in Postgres keyed by HMAC'd IP / email | Works across instances without Redis. |
| Hosting assumption | A Node.js host (VPS, Render, Railway, Fly.io, a Docker host) plus managed Postgres. Serverless works with the S3 driver and the cron endpoint | See `docs/DEPLOYMENT.md`. |

No payment infrastructure is included (customers pay at the appointment). No microservices.

## Scheduling model

* `working_hours`: recurring weekly rows in local wall-clock time (several rows per day express breaks).
* `schedule_exceptions`: per-date `closed`, `custom_hours` (replaces the day) or `blocked` (removes a period).
* `calendar_blocks`: **the single source of truth for occupied time**. Each live hold and each confirmed/completed booking owns exactly one row whose `period` is `[start, end of service + buffer)`. Constraint:

  ```sql
  EXCLUDE USING gist (technician_id WITH =, period WITH &&)
  ```

  Every write path (customer hold, confirmation, admin manual booking, reschedule) goes through this table, so two overlapping reservations cannot exist regardless of application bugs or concurrency.
* Holds expire (`expires_at`). Availability ignores expired holds immediately; a new hold deletes expired holds in its way inside its own transaction; housekeeping removes the rest.
* Confirmation converts the hold's block **in place** (`kind` hold to booking), so it never conflicts with its own interval.
* Rescheduling updates the booking's block in place; a conflict raises `23P01` and the whole transaction (including the original booking) rolls back unchanged.
* Availability (`src/lib/availability.ts`) is a pure function. It steps through **absolute** time from each opening instant, so daylight-saving gaps produce no slots and repeated hours produce distinct instants labelled with their offset. All instants are stored as `timestamptz`; local rules are evaluated in `Europe/London`.

## Pricing and promotions

* Pure engine in `src/lib/pricing.ts`, integer pence, half-up rounding applied once to the eligible subtotal, never below zero.
* Exactly one promotion per booking. The best automatic offer applies, and a valid entered code replaces it only when it saves at least as much (the customer is told which applied).
* At confirmation the server recalculates the quote with promotion rows locked `FOR UPDATE`, counts redemptions (`reserved`, `consumed`, `forfeited`), and rejects the request if the total differs from the total the customer reviewed (`price_changed` returns the new quote).
* Bookings snapshot item names, prices, durations, the promotion, and policy versions. Later catalogue/promotion edits never rewrite history.

## Private address

* Stored only in `private_location`, read only by `src/lib/server/private-location.ts`.
* Callers: admin pages (authenticated), the appointment page for a **valid token on a confirmed booking**, and the email worker when sending to that booking's own verified address.
* Public pages use `src/lib/server/public-content.ts`, which selects explicit public columns only.

## Security headers

`next.config.ts` adds `nosniff`, `DENY` framing and a strict referrer policy everywhere; token-bearing and admin routes also get `noindex`, `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. No third-party scripts or trackers are loaded anywhere.
