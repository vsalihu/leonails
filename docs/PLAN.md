# Rugile Nail Salon Website: Implementation Plan

## 1. Project objective

Build a complete, working nail salon website for Rugile in Wisbech. Combine an editorial luxury design with reliable appointment booking and an admin dashboard she can operate from her phone.

**Placeholders apply to content only. All functionality must work.** Use real database persistence, server-side availability, genuine admin actions, image storage and implemented email integrations. Do not deliver mock bookings, simulated success messages, hardcoded calendars or buttons without working actions.

This document is a build specification for Claude. Implement it in stages, maintain progress against the acceptance criteria and distinguish completed functionality from integrations awaiting credentials. The document itself does not claim anything has already been built.

## 2. Confirmed requirements and provisional defaults

### Confirmed by the owner of this project

- Salon location: Wisbech.
- The exact address is shared only after booking confirmation.
- Customers pay at the appointment. No online payment or deposit is required.
- Include a booking system, gallery and testimonials with pictures.
- Rugile must be able to create promo codes and discounts, including a first-visit percentage discount.
- Style: classy, restrained leopard print with a luxury fashion feel inspired by the visual discipline of Louis Vuitton and Valentino, without copying their branding.
- Include animation, subtle parallax, transitions and button interaction feedback.
- All business content can initially be editable placeholders.
- The complete application must function while using those placeholders.

### Provisional implementation defaults

These are changeable assumptions, not final business rules approved by Rugile.

| Setting | Initial default |
| --- | --- |
| Temporary name | Rugile Nail Atelier |
| Technician count | One |
| Booking confirmation | Automatic |
| Customer access | Guest booking; no mandatory account |
| Currency | GBP, stored as integer pence |
| Timezone | Europe/London |
| Appointment grid | Every 15 minutes |
| Post-appointment buffer | 15 minutes |
| Slot hold | 10 minutes |
| Minimum advance notice | 12 hours |
| Booking horizon | 60 days |
| Customer cancellation/reschedule cutoff | 24 hours before appointment |
| Reminder | One email 24 hours before appointment |
| Discount stacking | Disabled |

Make applicable settings editable in admin. Keep technician modelling simple while avoiding hardcoded technician IDs throughout business logic.

## 3. Visual direction

### Concept

A private nail atelier with confident typography, beautiful manicure photography, warm neutral backgrounds and leopard details used as a signature accent. Luxury should come from composition and restraint.

| Design token | Starting direction |
| --- | --- |
| Main background | Warm ivory, example #F7F3EC |
| Secondary background | Soft cream, example #EDE4D8 |
| Main text | Espresso, example #2B211D |
| Dark sections | Near-black brown, example #191512 |
| Supporting colour | Muted nude, example #C7A997 |
| Decorative accent | Antique champagne, example #A88958 |
| Heading typography | Elegant editorial serif |
| Interface typography | Highly legible sans serif |
| Borders | Fine, understated and consistent |
| Buttons | Clear solid or outlined forms with restrained corner radius |

These colours are proposed design tokens, not an assertion that every combination has adequate contrast. Check actual text/background combinations before using them.

### Composition rules

- Create a distinctive hero with oversized typography and a strong photographic crop.
- Vary section composition rather than repeating rows of three cards.
- Use generous spacing, clear alignment and consistent image art direction.
- Use leopard print in narrow panels, cropped decorative edges or occasional feature backgrounds.
- Never place important text directly over a busy leopard pattern.
- Keep booking forms visually quiet and exceptionally readable.
- Use licensed placeholder imagery with provenance recorded; do not imply it is Rugile's work.
- Do not invent qualifications, awards, customer counts or business history.
- Avoid gold gradients, constant sparkles, generic glass cards, oversized rounded panels and fake luxury logos.

## 4. Public pages

### Home

1. Hero image, short headline, Wisbech location and primary booking CTA.
2. Brief introduction to Rugile and the salon concept.
3. Featured treatments with price and duration.
4. Editorial gallery preview.
5. Selected testimonials with optional photographs.
6. Active promotion, shown only when enabled and eligible for public display.
7. Visit information, opening hours and final booking CTA.

Suggested temporary headline: "Beautiful nails. Considered detail."

### Treatments and prices

- Categorised treatment list with descriptions, price and duration.
- Clearly explain extras and removal requirements.
- Book buttons preselect the chosen treatment.
- Only advertise a fixed bookable price when the customer has selected all required options. Avoid an ambiguous "from" price becoming an unexpected final charge.

### Booking

Treatment selection, extras, available date/time, contact details, offer application, summary and confirmation.

### Gallery

- Filter by categories such as French, nude, nail art and occasion.
- Responsive image layout and keyboard-accessible lightbox.
- Optional captions and links to related treatments.
- Optimised images, useful alt text and graceful missing-image handling.

### Testimonials

- Genuine testimonials can include a manicure or customer photo, display name, quote and optional rating.
- Example testimonials must be labelled as examples while present.
- Do not fabricate external verification or Google review provenance.

### About and visit

- Editable introduction, studio photographs and practical visit information.
- Public location is Wisbech only.
- Display: "Based in Wisbech. Your appointment address will be provided once your booking is confirmed."
- Do not embed a map or precise coordinates revealing the address.

### Supporting pages

- Contact information and a working enquiry form with validation, rate limiting and delivery status.
- Editable cancellation policy, privacy information and booking terms.
- Private appointment management page accessed by a secure link.
- Helpful not-found and error states.

Mobile navigation must be easy to use with one hand. A sticky booking CTA must not cover content, forms or device safe areas.

## 5. Booking workflow and scheduling rules

### Customer journey

1. Choose a treatment and valid extras.
2. View total service duration and price.
3. Select an available date and start time.
4. Acquire a temporary server-side slot hold and show its expiry.
5. Enter name, email and phone number.
6. Apply an optional code; evaluate automatic offers.
7. Review treatment, appointment time, final price, payment method and booking conditions.
8. Submit using "Confirm appointment" with "Pay at your appointment" beside the total.
9. Receive a persisted confirmation, private address and appointment management link.

Guest email verification should be implemented before final confirmation/address release to reduce nuisance bookings. It must use the real email provider when configured, with retries and clear expiry handling. Avoid forcing account creation.

### Availability engine

- Compute availability on the server from service duration, extras, buffer, working hours, date exceptions, active holds and confirmed appointments.
- Occupied interval includes service time plus the configured buffer.
- A 15-minute grid controls offered start times; it does not round away required service time.
- Do not offer intervals that overlap a break, holiday, blocked period or existing reservation.
- Use timezone-aware scheduling and handle missing/repeated daylight-saving times explicitly.
- Store absolute appointment instants consistently; evaluate local working hours in Europe/London.
- Revalidate all inputs and availability at confirmation.
- Expired holds stop blocking availability even if the cleanup job has not run yet.
- Prevent hoarding with hold limits and rate limits.

### Database integrity

- Use a transactional reservation strategy and database-level overlap protection or appropriate locking. A frontend availability check alone is insufficient.
- Enforce protection across customer booking, manual booking, rescheduling and active holds.
- Confirming a hold must be atomic and must not conflict with its own reserved interval.
- Use idempotency to prevent duplicate appointments from repeated clicks or request retries.
- Concurrent attempts for the same interval must produce exactly one successful reservation.

### Lifecycle

- Booking states: confirmed, completed, cancelled and no-show.
- Holds are separate temporary records, not completed bookings.
- Record who changed an appointment and when.
- Cancellation frees the reserved interval and cancels pending reminders.
- Rescheduling atomically secures the new interval and releases the old one. Failure must preserve the original booking.
- Customer changes obey the editable cutoff. Admin can override with an explicit action and recorded reason.
- Admin must not silently override an overlapping appointment.
- If working hours or treatment durations change, flag affected future appointments; never silently move or cancel them.

## 6. Promotions and discounts

### Admin controls

- Promotion name and optional code.
- Percentage or fixed GBP amount.
- Manual code or automatic application.
- Active, scheduled or disabled status.
- Redemption start/end dates and separate eligible appointment dates.
- All-client or first-visit eligibility.
- Applicable treatments and eligible extras.
- Minimum spend, total usage limit and per-customer limit.
- Optional maximum saving for a percentage offer.
- Public banner text and whether the offer should appear on the website.

### Calculation and eligibility rules

- Calculate prices and eligibility on the server using integer money values.
- Normalise codes consistently and provide useful invalid-code messages.
- Apply only one promotion. If several automatic promotions qualify, choose the highest eligible saving; a valid entered code replaces it only after clearly showing the resulting price.
- Default percentage rounding: round the discount to the nearest penny once on the eligible subtotal.
- Never allow a discount to produce a negative total.
- Reserve/consume redemption capacity transactionally so simultaneous bookings cannot exceed limits.
- First-visit default: no completed prior appointment and no other active first-visit redemption for the verified customer identity.
- Associate customers using verified email and normalised contact data without silently merging ambiguous identities. Guest identity checks reduce abuse but cannot prove a person is unique.
- On cancellation, release an unused redemption; keep completed/no-show redemption history. Rescheduling keeps the existing redemption unless the offer's appointment restrictions are breached, in which case explain the revised price before confirmation.
- Save treatment names, prices, discount details, service duration and relevant policy version as booking snapshots.
- Later edits to promotions or catalogue items must not rewrite historical bookings.
- Support a manual admin discount with a reason and audit entry. Make replacement of an existing offer explicit.

## 7. Rugile's admin dashboard

Navigation: Today, Calendar, Bookings, Customers, Treatments, Promotions, Gallery, Reviews, Settings.

### Today and calendar

- Today's appointments, next appointment, available gaps and recent cancellations.
- Day/week views with readable mobile layouts.
- Quick actions to add an appointment or block time.
- Distinguish appointment status with text as well as colour.

### Appointment and customer management

- Search/filter bookings by customer, date and status.
- Create manual bookings, reschedule, cancel and change status.
- View contact details and appointment history.
- Private notes visible only to authorised admin users.
- Block/unblock repeat abusive or no-show customers with a recorded reason.
- Record payment received at the appointment without processing online payments.
- Keep expected booking value separate from recorded received payment.

### Business management

- Create, edit, reorder, archive and activate treatments/extras.
- Manage working hours, exceptions, holidays, buffers and booking limits.
- Manage promotions and manual discounts.
- Edit homepage copy, business name, contact details and policies.
- Manage the private appointment address separately from public location fields.
- Archive referenced records rather than breaking existing booking history.

### Gallery and reviews

- Upload multiple images, choose crops, categorise, reorder, feature and remove them.
- Validate image type and size; re-encode uploads and remove embedded location metadata.
- Add/edit testimonials and optional images; record publication consent.
- Invite customers with completed appointments to submit a review via a secure link.
- New submissions stay unpublished until approved by Rugile.
- Approve, reject, hide and feature reviews.
- Customers cannot publish directly or change someone else's review.

## 8. Motion and responsive behaviour

| Surface | Motion specification |
| --- | --- |
| Initial hero | Short image and heading reveal; main content never waits for a loading intro |
| Section entry | Small vertical movement with subtle fade; avoid repeatedly replaying |
| Hero photography | Restrained desktop parallax where performance permits |
| Gallery hover | Gentle crop zoom and optional caption reveal |
| Lightbox | Smooth open/close with focus trapping and keyboard controls |
| Buttons | Brief colour change and slight press feedback |
| Booking selection | Clear selected state and short transition |
| Booking steps | Short fade or slide without losing values or focus context |
| Confirmation | Restrained success animation with persistent readable details |

- Starting timing guidance: 120 to 220 ms for controls, 250 to 450 ms for larger reveals.
- Animate transform/opacity where practical; avoid layout thrashing.
- Respect reduced-motion preferences and remove parallax in that mode.
- Keep core content visible if animation scripts fail.
- Do not hijack scroll, add a custom cursor or make functionality hover-dependent.
- Test keyboard use, visible focus, field labels, error announcements and contrast.
- Preserve entered form data when navigating between steps.
- Provide loading, empty, success, validation-error and service-error states.

## 9. Technical architecture and data model

Choose a coherent, maintained full-stack setup compatible with the actual hosting environment. Before implementation, document framework, relational database, authentication, object storage, email provider and background-job mechanism in a short architecture decision. Check their current official documentation at implementation time.

Do not add online payment infrastructure for this scope. Avoid unnecessary microservices.

### Core records

| Record | Responsibility |
| --- | --- |
| Business settings | Public details and operational settings |
| Private location | Restricted address and arrival instructions |
| Admin identity | Authentication and authorisation |
| Technician | Scheduling owner, initially Rugile |
| Treatment / extra | Catalogue, price, duration, compatibility and active status |
| Working hours / exception | Recurring schedule and date-specific changes |
| Customer | Contact details, verification and block state |
| Slot hold | Reserved interval, owner/session and expiry |
| Booking / booking items | Appointment, immutable price/duration snapshots and status |
| Promotion / redemption | Offer rules, reservation and redemption history |
| Media asset | Image storage key, caption, category, crop and publication status |
| Testimonial | Text, rating, image, consent and moderation status |
| Notification job | Durable delivery state, deduplication and retries |
| Audit event | Important administrative changes |

### Email and background tasks

- Implement verification, confirmation, cancellation, rescheduling, reminders and admin password recovery.
- Use a durable queue/outbox so a booking is not lost when email delivery fails.
- Retry transient failures without sending duplicate messages.
- Cancel or replace reminder jobs when appointments change.
- Skip reminders whose scheduled time is already past; confirmation handles short-notice bookings.
- Show failed delivery status to admin with a safe retry option.
- A development mailbox may capture real generated messages for testing. Do not claim external delivery until provider credentials and domain configuration are verified.

### Security and private address

- Authorise every admin and customer management request on the server.
- Protect the address in a private data field; never include it in public HTML, client bundles, public queries, structured data, maps or image metadata.
- Confirmation and management links must use high-entropy tokens, with appropriate expiry/revocation and no sequential-ID-only access.
- Keep private confirmation pages out of indexes and shared caches. Avoid third-party tracking on token-bearing pages and suppress referrer leakage.
- No address in calendar feeds or invitations unless delivered privately after confirmation.
- Protect sessions, validate input, rate-limit sensitive endpoints and keep secrets server-side.
- Private notes, customer lists and full contact details must never be publicly readable.
- Provide environment templates without secrets, migrations, backups and a documented restore procedure.

## 10. Placeholder content strategy

Seed editable example content into the actual data model. Do not create a separate fake booking engine or demo-only user journey.

### Example catalogue, not approved business prices

| Treatment | Example price | Example duration |
| --- | --- | --- |
| Gel manicure | £30 | 60 minutes |
| Builder gel overlay | £38 | 75 minutes |
| Builder gel infill | £35 | 75 minutes |
| Removal only | £15 | 30 minutes |
| French finish extra | £5 | +15 minutes |
| Simple nail art extra | £5 | +15 minutes |

- Seed a clearly editable example weekly schedule, private address field and WELCOME20 promotion.
- The private address placeholder should explicitly say it requires replacement, not point to an unrelated real property.
- Mark seeded content with provenance flags so it can be found and replaced safely.
- Rerunning seed scripts must not duplicate content or overwrite owner edits.
- Never fabricate contact recipients. Configure test delivery to a controlled mailbox.
- Do not bulk-delete records with genuine bookings when removing example content. Archive referenced catalogue items and retain booking snapshots.
- Keep development/staging access private while unapproved prices and example business details are present. This is deployment access control, not a restriction on application functionality.
- Production launch is a separate operational step, not a reason to defer working features.

## 11. Build stages and completion gates

### Stage 1: Foundation and design system

- [ ] Inspect the repository and applicable project instructions.
- [ ] Read relevant installed Claude skills for frontend design, accessibility, motion, backend work and testing.
- [ ] Document architecture, environment variables and deployment assumptions.
- [ ] Establish database migrations and repeatable sample content.
- [ ] Implement design tokens and a polished responsive homepage.
- [ ] Review homepage and mobile screenshots against the visual brief before repeating the design across pages.

### Stage 2: Public content and media

- [ ] Build treatments, gallery, testimonials, about/visit and supporting pages.
- [ ] Connect content to persistent data.
- [ ] Implement image storage, crops, responsive delivery and lightbox.
- [ ] Add the agreed motion system and reduced-motion support.
- [ ] Implement navigation, contact form and complete interface states.

### Stage 3: Scheduling and booking

- [ ] Implement working hours, exceptions, buffers and server availability.
- [ ] Implement holds, expiry and transactional collision protection.
- [ ] Build guest verification, booking confirmation and private address access.
- [ ] Implement secure cancellation and atomic rescheduling.
- [ ] Implement promotion calculation and redemption limits.
- [ ] Implement email outbox, delivery and reminder scheduling.

### Stage 4: Admin operation

- [ ] Implement secure login and recovery.
- [ ] Build Today, calendar and booking management.
- [ ] Build customer history, private notes and block controls.
- [ ] Implement catalogue, schedule and promotion management.
- [ ] Implement gallery management and testimonial moderation.
- [ ] Implement editable business content, private location and policies.
- [ ] Ensure daily admin tasks work comfortably on mobile.

### Stage 5: Verification and handover

- [ ] Run the acceptance scenarios below against the actual implementation.
- [ ] Resolve functional, accessibility and responsive defects.
- [ ] Verify email delivery using a controlled real recipient when configured.
- [ ] Supply deployment, backup and restore instructions.
- [ ] Supply a concise Rugile admin guide and remaining configuration list.
- [ ] Clearly report what is implemented, tested and awaiting credentials/content.

### Stage 6: Public launch preparation

- [ ] Replace temporary business name, prices, durations, schedule and private address.
- [ ] Replace or remove example reviews and imagery.
- [ ] Confirm payment methods, cancellation rules and other customer-facing policies with Rugile.
- [ ] Configure production sender, domain, background jobs, database and storage.
- [ ] Remove test appointments without affecting genuine records.
- [ ] Verify a full booking, address reveal, email, cancellation and admin update on the deployment.
- [ ] Obtain the project owner's launch instruction before making the site public.

## 12. Required acceptance scenarios

| Scenario | Passing result |
| --- | --- |
| Two customers reserve the same interval concurrently | Only one succeeds; the other receives useful alternatives |
| Customer selects a duration-increasing extra | Availability and occupied interval update correctly |
| Appointment overlaps a break or closing time | Slot is unavailable |
| Hold expires during checkout | Confirmation fails safely and allows another selection |
| Customer double-clicks confirmation | One booking and one confirmation job |
| Booking succeeds but email provider fails | Booking remains valid; message is queued/retried and admin can see failure |
| Customer submits a modified price | Server ignores/rejects it and calculates the authoritative amount |
| Last promotion redemption is contested | Redemption limit cannot be exceeded |
| Ineligible or expired offer is entered | Clear reason, no discount applied |
| Treatment or promotion is edited later | Existing booking snapshots remain intact |
| Reschedule target becomes unavailable | Original appointment is retained |
| Appointment is cancelled | Availability is released and reminder is suppressed |
| Booking crosses a daylight-saving boundary | Correct local time and duration without duplicate ambiguous slots |
| Anonymous user requests private address/admin data | Access denied with no data leakage |
| Someone guesses another booking ID | No access without its valid authorisation token |
| Public site and media are inspected | No exact address or location metadata is exposed |
| Review is submitted | Stored pending moderation, not immediately published |
| Customer uploads an invalid file | Rejected safely with a useful error |
| Admin changes working hours over existing bookings | Conflicts are flagged without silently altering appointments |
| Reduced motion and keyboard navigation are enabled | Complete readable and operable experience |
| Mobile booking and admin are used | No clipped controls, horizontal overflow or covered content |
| Server restarts or page reloads | Persisted records and scheduled work remain recoverable |

## 13. Scope boundaries

Deliver all specified booking, gallery, testimonial, promotion and admin functionality in the initial build. Do not postpone these because the content is temporary.

Customer accounts, loyalty points, gift cards, SMS/WhatsApp delivery, waiting lists, multi-technician scheduling and online payments are optional future scope. Do not let them delay the agreed build unless explicitly requested.

## 14. Claude execution instruction

Use this document as the project specification. Start by inspecting the existing project and relevant installed skills. Make ordinary implementation decisions independently and document assumptions. Ask only when a genuinely blocking decision cannot be safely defaulted.

Build incrementally with working vertical slices. Do not stop after producing a plan or frontend mockup. Maintain a short progress log and test the actual persistence, concurrency, authorisation and email paths. Do not label the project complete while core actions are simulated or essential integrations are unimplemented.

When credentials are unavailable, finish the integration code and configuration documentation, expose truthful operational status and identify the exact remaining setup. Never invent credentials or claim a message was delivered when it was only logged.

Final handover must include the working application, migrations, seed process, environment template, verification results, admin guide and deployment instructions. Full functionality now; final business content before public launch.
