# Status and verification report

Snapshot of what is built, how it was verified, and what is still needed. The build environment had PostgreSQL 16, Node.js 22 and Chromium available, no outbound internet beyond the npm registry, no email provider credentials and no Docker daemon.

## Summary

| Area | Status |
| --- | --- |
| Public site (home, treatments, gallery, reviews, about, contact, policies) | Implemented and tested |
| Booking (availability, holds, verification, offers, confirmation, private address, reschedule, cancel) | Implemented and tested |
| Admin dashboard (all nine sections plus messages and activity log) | Implemented and tested |
| Database-level double-booking protection | Implemented and tested |
| Email outbox, retries, reminders, failure visibility | Implemented and tested with the development mailbox and a simulated provider failure |
| **Real email delivery** | **Code complete, awaiting SMTP credentials and a verified sending domain.** Not verified: no provider was available. |
| Image storage | Local driver tested. S3 driver implemented, **not verified** (no bucket available). |
| Deployment | Plain Node.js deployment documented. Not deployed to a host from here. |
| Content | **All business content is example content** (see the launch checklist below). |

## Automated checks (latest run)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Pass |
| `eslint .` (Next.js core-web-vitals + TypeScript + React Compiler rules) | Pass, 0 warnings |
| `next build` (production) | Pass |
| Unit + integration (`vitest`, real PostgreSQL) | **48 passed** (4 files) |
| End-to-end (`playwright`, Chromium, desktop and Pixel 7 emulation) | **42 passed**, 2 skipped (single-project tests skipped on the other project by design) |
| Backup and restore round trip (`scripts/backup.sh` then `pg_restore`) | Pass (row counts matched) |

## Acceptance scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| Two customers reserve the same interval concurrently | Pass: 6 concurrent attempts, exactly 1 hold, 5 get `slot_taken` with alternatives that exclude the taken time | `booking.test.ts` "two customers reserving the same interval concurrently" |
| Overlap blocked even if application checks are bypassed | Pass: raw insert rejected by the exclusion constraint (`23P01`) | `booking.test.ts` "the database rejects overlapping reservations" |
| Duration-increasing extra | Pass: slot list shrinks and the reserved interval equals service + extra + buffer | `booking.test.ts`, `availability.test.ts` |
| Appointment overlapping a break or closing time | Pass: unavailable, as are off-grid times | `booking.test.ts`, `availability.test.ts` |
| Hold expires during checkout | Pass: confirmation fails with `hold_expired`; time immediately bookable by others even before cleanup | `booking.test.ts` |
| Customer double-clicks confirmation | Pass: 3 simultaneous confirms produce 1 booking and 1 confirmation job | `booking.test.ts` |
| Booking succeeds but email provider fails | Pass: booking stays confirmed; job retries with backoff, ends `failed` with the error; admin retry delivers exactly once | `notifications.test.ts` |
| Customer submits a modified price | Pass: rejected with `price_changed` and the authoritative quote; no booking created | `booking.test.ts` |
| Last promotion redemption contested | Pass: 2 concurrent confirmations for a 1-use code, exactly 1 discounted booking | `booking.test.ts` |
| Ineligible or expired offer | Pass: clear reason (expired, minimum spend, unknown code, first visit only), no discount | `booking.test.ts`, E2E booking test |
| Treatment or promotion edited later | Pass: names, prices, discount and offer name on the booking unchanged | `booking.test.ts` "stores immutable snapshots" |
| Reschedule target unavailable | Pass: customer and admin attempts refused; original time and status retained | `booking.test.ts` |
| Appointment cancelled | Pass: interval released, reminder `cancelled`, unused redemption `released` | `booking.test.ts` |
| Booking across a daylight-saving boundary | Pass: spring-forward gap has no slots and durations stay 60 real minutes; fall-back repeated hour gives distinct instants with labels like `01:30 BST` / `01:30 GMT` | `availability.test.ts` |
| Anonymous user requests private address or admin data | Pass: admin routes redirect to sign-in; forged cookie shows nothing; upload API returns 401 | `admin.spec.ts` |
| Someone guesses another booking ID | Pass: IDs and wrong or revoked tokens resolve to nothing (404) | `booking.test.ts` "booking ids alone grant nothing", `booking.spec.ts` |
| Public site and media inspected | Pass: address absent from every public page and JS bundle; EXIF/GPS/XMP/IPTC absent from every stored image variant | `booking.spec.ts` "never exposes the private address", `media-reviews.test.ts` |
| Review submitted | Pass: stored `pending`, not public until approved; one review per booking | `media-reviews.test.ts`, `forms.spec.ts` |
| Customer uploads an invalid file | Pass: non-images, empty, tiny and oversized files rejected with a clear message (HTTP 422) | `media-reviews.test.ts`, `forms.spec.ts` |
| Admin changes working hours over existing bookings | Pass: booking flagged `needs_review`, time and status unchanged | `booking.test.ts` |
| Reduced motion and keyboard navigation | Pass: reveals visible immediately, parallax static; skip link, booking steps and mobile menu operable by keyboard; axe finds no serious or critical WCAG 2.1 AA issues on 9 pages | `a11y.spec.ts` |
| Mobile booking and admin | Pass: full booking on Pixel 7 emulation; 12 admin screens with no horizontal overflow | `booking.spec.ts`, `admin.spec.ts` |
| Server restarts or page reloads | Pass by design: bookings, holds and emails are database records; a crashed worker's job is reclaimed after its lease | `notifications.test.ts` "a stuck job is reclaimed" |

### Defects found and fixed during verification

* Availability ignored existing holds and bookings because of a NULL comparison (`IS DISTINCT FROM NULL`). Double booking was still impossible thanks to the database constraint, but customers could be offered times that were already taken. Fixed, with a regression test.
* React 19 cleared admin forms after a failed submission (e.g. a wrong password wiped the email). Admin forms now keep their values.
* Several admin forms on one page shared input IDs, so labels pointed at the wrong fields for screen readers. Labels are now associated per field.
* Login rate limiting counted successful sign-ins. Only failures count now.
* Star ratings weren't announced to screen readers, and the upcoming booking step labels failed contrast. Both fixed.

## Not verified here (needs real services)

1. **Email delivery to real inboxes.** Set the SMTP variables, verify the domain (SPF/DKIM), then make a test booking to an inbox you control. Check that the verification code, confirmation (with address and link), cancellation, reschedule, reminder, admin alert, review invite and password reset all arrive. See `DEPLOYMENT.md`.
2. **S3-compatible storage.** If used, upload an image in the admin and confirm it displays and survives a redeploy.
3. **Production hosting.** Deploy, run migrations, create the admin, then repeat a full booking, address reveal, cancellation and admin update on the deployed site.

## Remaining configuration

| Item | Where |
| --- | --- |
| `APP_URL`, `APP_SECRET`, `DATABASE_URL` | Host environment |
| SMTP provider credentials, `MAIL_FROM`, DNS records | Host environment + domain DNS |
| Storage (persistent volume or S3 bucket) | Host environment |
| `TRUSTED_PROXY_COUNT` for your host | Host environment |
| Admin account for Rugile | `npm run admin:create` |
| Booking alert email | Admin > Settings > Business |

## Before public launch

These are business decisions and content, not code:

- [ ] Business name, contact email/phone, Instagram (Admin > Settings > Business)
- [ ] Real treatments, prices, durations and extras; archive the examples (Admin > Treatments)
- [ ] Real weekly hours and any holidays (Admin > Settings > Working hours, Admin > Calendar)
- [ ] The real private address and arrival instructions (Admin > Settings > Private address)
- [x] Rugile's own photos in the gallery and website slots (six supplied in October 2026, stored in `content/gallery`, metadata removed). Add more over time in Admin > Gallery.
- [ ] Confirm each client in the gallery photos is happy for their hands to be published
- [ ] Delete the three example reviews (Admin > Reviews)
- [ ] Website copy for the homepage, About and Treatments (Admin > Settings > Website copy)
- [ ] Confirm payment methods, cancellation rules, booking terms and privacy notice with Rugile, then publish them (Admin > Settings > Policies)
- [ ] Review or disable the WELCOME20 example offer (Admin > Promotions)
- [ ] Booking rules: notice, horizon, buffer, cutoff, reminder timing (Admin > Settings > Booking rules)
- [ ] Remove test bookings: `npm run bookings:purge-test -- --domain <test-domain> --confirm`
- [ ] Verify a full booking, address reveal, email, cancellation and admin update on the live deployment
- [ ] The project owner's go-ahead to make the site public

The **Before launch** panel on Admin > Today lists any example content still in use.

## Known limitations and optional future scope

* One technician. The data model has a `technicians` table and every reservation is keyed by technician, so adding staff later doesn't need a rewrite, but there's no staff UI.
* No customer accounts, online payments, gift cards, SMS/WhatsApp, waiting lists or loyalty points (out of scope per the plan).
* Phone numbers are normalised for UK formats when checking first-visit eligibility. Guest identity checks reduce abuse but can't prove someone is a new client.
* The site has a single light editorial theme with dark accent sections, as the brief describes, and no separate dark mode.
* Placeholder images are rendered still lifes (glossy nails on satin and leopard silk) generated in code, as no stock photography was reachable from the build environment. Each is marked "Placeholder image" and flagged as an example.
* Hero video is uploaded as-is (MP4/WebM, up to 40 MB) and not transcoded on the server, so export it web-optimised (H.264 MP4, about 1080p, `faststart`).
