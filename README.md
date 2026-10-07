# Rugile Nail Atelier

Website, booking system and admin dashboard for a one-to-one nail studio in Wisbech.

* **Public site:** editorial homepage, treatments and prices, filterable gallery with lightbox, reviews, about and visiting, contact form, policies.
* **Booking:** choose treatment and extras, live availability, 10-minute slot hold, email verification code, offer codes, confirm, then a private page with the appointment address and self-service reschedule/cancel. Customers pay at the appointment.
* **Admin (`/admin`):** today view, day/week calendar, bookings, customers, treatments, promotions, gallery, reviews, messages, settings. Built for phone use.

All business content (name, prices, hours, address, images, reviews, policies) is **example content** stored in the real database and editable in the admin. See [`docs/STATUS.md`](docs/STATUS.md) for what's verified and what's still needed before launch.

## Documentation

| Document | For |
| --- | --- |
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Rugile: day-to-day use of the dashboard |
| [`docs/HOSTING_TEMPORARY.md`](docs/HOSTING_TEMPORARY.md) | Step-by-step: put the full site online on Railway (temporary hosting) |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Hosting, environment, email, storage, backups and restore |
| [`docs/STATUS.md`](docs/STATUS.md) | Verification results, acceptance scenarios, remaining configuration |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technical decisions and data model |
| [`docs/PLAN.md`](docs/PLAN.md) | The original specification |

## Local development

Requirements: Node.js 20.9+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then set APP_SECRET (openssl rand -base64 48) and DATABASE_URL
npm run db:setup                # migrations + example content (safe to re-run)
ADMIN_PASSWORD='choose-a-long-password' npm run admin:create -- --email you@example.com --name "Rugile"
npm run dev                     # http://localhost:3000 and http://localhost:3000/admin
```

With `MAIL_DRIVER=devmailbox` (the default) emails are rendered and stored in the database instead of being sent. Read them in **Admin > Messages > Development mailbox**, including booking verification codes.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run db:migrate` | Applies new SQL migrations in `db/migrations` |
| `npm run db:seed` | Adds example content once (never duplicates or overwrites edits) |
| `npm run admin:create -- --email … --name …` | Creates an admin, or resets an admin's password |
| `npm run worker` | Standalone email worker (if not running it inside the web server) |
| `npm run assets:generate` | Regenerates the leopard textures in `public/textures` |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Unit and integration tests (needs the test database, see below) |
| `npm run test:e2e` | Playwright browser tests against a running app |
| `scripts/backup.sh` | Database dump plus image archive |

## Tests

```bash
# one-off: a separate database for integration tests (its schema is wiped on every run)
createdb leonails_test && psql leonails_test -c 'CREATE EXTENSION btree_gist; CREATE EXTENSION citext;'
npm test

# browser tests: start the app first (npm run dev), with an admin matching
# E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (defaults: rugile@example.test / dev-password-1234)
npm run test:e2e
```

End-to-end tests create and cancel real bookings in the database the app is using, so run them against a development or staging database, never production. If Playwright can't find a browser, set `PLAYWRIGHT_CHROMIUM_PATH`.

## Project layout

```
db/migrations/          SQL migrations (exclusion constraint against double booking lives here)
scripts/                migrate, seed, create-admin, worker, backup, placeholder art generator
src/app/(site)/         public pages, booking flow, appointment and review pages
src/app/admin/          sign-in and the admin dashboard
src/app/api/            booking, appointment, review, contact, upload and cron endpoints
src/lib/availability.ts pure, DST-safe slot engine
src/lib/pricing.ts      pure price and promotion engine
src/lib/server/         database access, bookings, holds, auth, email outbox, storage, images
tests/                  unit, integration (real PostgreSQL) and Playwright end-to-end tests
```
