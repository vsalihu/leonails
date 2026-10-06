# Progress log

Running log against the build stages in `docs/PLAN.md`. Full verification results are in `docs/STATUS.md`.

## Stage 1: Foundation and design system (done)
- Next.js 16 + Tailwind 4 + PostgreSQL; architecture in `docs/ARCHITECTURE.md`; env template `.env.example`.
- SQL migrations with an exclusion constraint against overlapping reservations; idempotent seed with provenance flags.
- Pure availability engine (DST-safe) and pricing/promotion engine with unit tests.
- Design tokens with measured contrast; generated leopard texture; homepage reviewed at 1440 px and 390 px.

## Stage 2: Public content and media (done)
- Treatments, gallery (filters, masonry, keyboard lightbox), reviews, about/visit, contact (stored, rate limited), policies, review submission, not-found/error pages.
- Image pipeline: decode-validated uploads, WebP variants, metadata stripped; local and S3 drivers.
- Motion: hero entrance, scroll reveals, desktop parallax, all disabled for reduced motion.

## Stage 3: Scheduling and booking (done)
- Holds with expiry, email verification codes, confirmation, private appointment page, reschedule, cancel, .ics without address.
- Promotions with transactional redemption limits; durable email outbox with retries and reminders.

## Stage 4: Admin (done)
- Auth with password reset; Today, calendar, bookings, customers, treatments, promotions, gallery, reviews, messages, settings, activity log; mobile layouts.

## Stage 5: Verification and handover (done)
- 48 unit/integration tests, 41 browser tests (incl. axe accessibility scans), production build, backup/restore round trip.
- README, deployment and backup guide, admin guide, status report.

## Stage 6: Public launch preparation (not started; needs the owner)
- Real content, SMTP credentials and domain, hosting, final live verification and launch approval. Checklist in `docs/STATUS.md`.
