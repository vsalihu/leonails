-- Rugile Nail Atelier: initial schema.
-- Money is integer pence. Instants are timestamptz (UTC). Local schedule rules
-- (working hours, exceptions) are stored as local wall-clock values and
-- evaluated in the business timezone by the application.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Settings & content
-- ---------------------------------------------------------------------------

-- Single-row operational + public settings. Keyed by id = 1.
CREATE TABLE business_settings (
  id                      smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name           text NOT NULL,
  public_location         text NOT NULL,
  contact_email           text,            -- public enquiry address shown on site
  notification_email      text,            -- where admin notifications go
  contact_phone           text,
  instagram_handle        text,
  timezone                text NOT NULL DEFAULT 'Europe/London',
  currency                text NOT NULL DEFAULT 'GBP',
  slot_interval_minutes   int  NOT NULL DEFAULT 15  CHECK (slot_interval_minutes BETWEEN 5 AND 60),
  buffer_minutes          int  NOT NULL DEFAULT 15  CHECK (buffer_minutes BETWEEN 0 AND 120),
  hold_minutes            int  NOT NULL DEFAULT 10  CHECK (hold_minutes BETWEEN 2 AND 30),
  min_notice_minutes      int  NOT NULL DEFAULT 720 CHECK (min_notice_minutes >= 0),
  horizon_days            int  NOT NULL DEFAULT 60  CHECK (horizon_days BETWEEN 1 AND 365),
  customer_change_cutoff_minutes int NOT NULL DEFAULT 1440 CHECK (customer_change_cutoff_minutes >= 0),
  reminder_lead_minutes   int  NOT NULL DEFAULT 1440 CHECK (reminder_lead_minutes >= 0),
  reminders_enabled       boolean NOT NULL DEFAULT true,
  allow_discount_stacking boolean NOT NULL DEFAULT false, -- reserved; engine applies one promotion
  bookings_enabled        boolean NOT NULL DEFAULT true,
  is_example              boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Restricted: the private appointment address. Never read by public queries.
CREATE TABLE private_location (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  address_lines        text NOT NULL,
  postcode             text,
  arrival_instructions text,
  is_example           boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Editable copy blocks (homepage, about, visit) keyed by slot.
CREATE TABLE content_blocks (
  key         text PRIMARY KEY,
  title       text,
  body        text NOT NULL DEFAULT '',
  is_example  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Versioned policies. Bookings snapshot the version they agreed to.
CREATE TABLE policies (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('cancellation','privacy','booking_terms')),
  version     int  NOT NULL,
  body        text NOT NULL,
  is_example  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

-- ---------------------------------------------------------------------------
-- Admin identity
-- ---------------------------------------------------------------------------

CREATE TABLE admin_users (
  id             bigserial PRIMARY KEY,
  email          citext NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE admin_sessions (
  token_hash   bytea PRIMARY KEY,
  admin_id     bigint NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text
);
CREATE INDEX admin_sessions_admin_idx ON admin_sessions(admin_id);

CREATE TABLE admin_password_resets (
  token_hash  bytea PRIMARY KEY,
  admin_id    bigint NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Scheduling owners & schedule
-- ---------------------------------------------------------------------------

CREATE TABLE technicians (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX technicians_one_default ON technicians(is_default) WHERE is_default;

-- Recurring weekly hours. Multiple rows per weekday express breaks
-- (e.g. 09:30-13:00 and 14:00-18:00). weekday: 1 = Monday ... 7 = Sunday (ISO).
CREATE TABLE working_hours (
  id             bigserial PRIMARY KEY,
  technician_id  bigint NOT NULL REFERENCES technicians(id),
  weekday        smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  is_example     boolean NOT NULL DEFAULT false,
  CHECK (end_time > start_time)
);
CREATE INDEX working_hours_tech_idx ON working_hours(technician_id, weekday);

-- Date-specific overrides. kind = 'closed' closes the whole day;
-- kind = 'custom_hours' replaces that day's hours with the listed rows
-- (all rows of the same date are combined); kind = 'blocked' removes a period.
CREATE TABLE schedule_exceptions (
  id             bigserial PRIMARY KEY,
  technician_id  bigint NOT NULL REFERENCES technicians(id),
  local_date     date NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('closed','custom_hours','blocked')),
  start_time     time,
  end_time       time,
  note           text,
  created_by     bigint REFERENCES admin_users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'closed' AND start_time IS NULL AND end_time IS NULL) OR
    (kind <> 'closed' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);
CREATE INDEX schedule_exceptions_date_idx ON schedule_exceptions(technician_id, local_date);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE treatment_categories (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_example  boolean NOT NULL DEFAULT false
);

CREATE TABLE treatments (
  id                bigserial PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  category_id       bigint REFERENCES treatment_categories(id),
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  notes             text,             -- e.g. removal requirements
  price_pence       int NOT NULL CHECK (price_pence >= 0),
  duration_minutes  int NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  is_featured       boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  sort_order        int NOT NULL DEFAULT 0,
  is_example        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE extras (
  id                bigserial PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  price_pence       int NOT NULL CHECK (price_pence >= 0),
  duration_minutes  int NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0 AND duration_minutes <= 240),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  sort_order        int NOT NULL DEFAULT 0,
  is_example        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Which extras are compatible with which treatment.
CREATE TABLE treatment_extras (
  treatment_id  bigint NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  extra_id      bigint NOT NULL REFERENCES extras(id) ON DELETE CASCADE,
  PRIMARY KEY (treatment_id, extra_id)
);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                 bigserial PRIMARY KEY,
  email              citext NOT NULL UNIQUE,
  name               text NOT NULL,
  phone              text,
  phone_normalised   text,
  email_verified_at  timestamptz,
  is_blocked         boolean NOT NULL DEFAULT false,
  blocked_reason     text,
  blocked_at         timestamptz,
  private_notes      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_phone_idx ON customers(phone_normalised);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

CREATE TABLE promotions (
  id                        bigserial PRIMARY KEY,
  name                      text NOT NULL,
  code                      text UNIQUE,     -- normalised upper-case; NULL for automatic offers
  application               text NOT NULL CHECK (application IN ('code','automatic')),
  discount_type             text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  percent_off               int CHECK (percent_off BETWEEN 1 AND 100),
  amount_off_pence          int CHECK (amount_off_pence > 0),
  max_saving_pence          int CHECK (max_saving_pence > 0),
  status                    text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  redeem_from               timestamptz,
  redeem_until              timestamptz,
  appointment_from          date,
  appointment_until         date,
  eligibility               text NOT NULL DEFAULT 'all' CHECK (eligibility IN ('all','first_visit')),
  applies_to_all_treatments boolean NOT NULL DEFAULT true,
  applies_to_extras         boolean NOT NULL DEFAULT true,
  min_spend_pence           int NOT NULL DEFAULT 0 CHECK (min_spend_pence >= 0),
  usage_limit               int CHECK (usage_limit > 0),
  per_customer_limit        int CHECK (per_customer_limit > 0),
  show_on_site              boolean NOT NULL DEFAULT false,
  banner_text               text,
  is_example                boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK ((application = 'code') = (code IS NOT NULL)),
  CHECK ((discount_type = 'percent' AND percent_off IS NOT NULL AND amount_off_pence IS NULL)
      OR (discount_type = 'fixed' AND amount_off_pence IS NOT NULL AND percent_off IS NULL))
);

CREATE TABLE promotion_treatments (
  promotion_id  bigint NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  treatment_id  bigint NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, treatment_id)
);

-- ---------------------------------------------------------------------------
-- Bookings, holds and the calendar reservation table
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  id                     bigserial PRIMARY KEY,
  reference              text NOT NULL UNIQUE,          -- short human reference, not an access credential
  technician_id          bigint NOT NULL REFERENCES technicians(id),
  customer_id            bigint NOT NULL REFERENCES customers(id),
  status                 text NOT NULL CHECK (status IN ('confirmed','completed','cancelled','no_show')),
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,           -- end of service (excl. buffer)
  buffer_minutes         int NOT NULL,
  -- snapshots
  customer_name          text NOT NULL,
  customer_email         citext NOT NULL,
  customer_phone         text,
  subtotal_pence         int NOT NULL CHECK (subtotal_pence >= 0),
  discount_pence         int NOT NULL DEFAULT 0 CHECK (discount_pence >= 0),
  total_pence            int NOT NULL CHECK (total_pence >= 0),
  promotion_id           bigint REFERENCES promotions(id),
  promotion_snapshot     jsonb,
  manual_discount_reason text,
  policy_versions        jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_notes         text,
  -- operations
  source                 text NOT NULL CHECK (source IN ('online','admin')),
  idempotency_key        text UNIQUE,
  hold_id                bigint UNIQUE,
  needs_review           boolean NOT NULL DEFAULT false,
  review_reason          text,
  payment_received_pence int,
  payment_method         text,
  payment_recorded_at    timestamptz,
  cancelled_at           timestamptz,
  cancellation_reason    text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (total_pence = subtotal_pence - discount_pence)
);
CREATE INDEX bookings_starts_idx ON bookings(starts_at);
CREATE INDEX bookings_customer_idx ON bookings(customer_id);
CREATE INDEX bookings_status_idx ON bookings(status, starts_at);

CREATE TABLE booking_items (
  id                bigserial PRIMARY KEY,
  booking_id        bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('treatment','extra')),
  treatment_id      bigint REFERENCES treatments(id),
  extra_id          bigint REFERENCES extras(id),
  name              text NOT NULL,
  price_pence       int NOT NULL,
  duration_minutes  int NOT NULL,
  sort_order        int NOT NULL DEFAULT 0
);
CREATE INDEX booking_items_booking_idx ON booking_items(booking_id);

-- High-entropy access tokens for the customer management page. Only hashes stored.
CREATE TABLE booking_access_tokens (
  token_hash   bytea PRIMARY KEY,
  booking_id   bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN ('manage','review')),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_access_tokens_booking_idx ON booking_access_tokens(booking_id);

-- Temporary slot holds created during checkout.
CREATE TABLE slot_holds (
  id                 bigserial PRIMARY KEY,
  public_id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  session_id         text NOT NULL,                 -- random id from an httpOnly cookie
  technician_id      bigint NOT NULL REFERENCES technicians(id),
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  buffer_minutes     int NOT NULL,
  treatment_id       bigint NOT NULL REFERENCES treatments(id),
  extra_ids          bigint[] NOT NULL DEFAULT '{}',
  expires_at         timestamptz NOT NULL,
  -- guest email verification for this checkout
  email              citext,
  verification_code_hash bytea,
  verification_sent_at   timestamptz,
  verification_attempts  int NOT NULL DEFAULT 0,
  email_verified_at  timestamptz,
  ip_hash            text,
  released_at        timestamptz,
  converted_booking_id bigint REFERENCES bookings(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slot_holds_session_idx ON slot_holds(session_id);
CREATE INDEX slot_holds_expiry_idx ON slot_holds(expires_at);

ALTER TABLE bookings ADD CONSTRAINT bookings_hold_fk FOREIGN KEY (hold_id) REFERENCES slot_holds(id);

-- The single source of truth for occupied time. Every live hold and every
-- confirmed/completed booking owns exactly one row. The exclusion constraint
-- makes overlapping reservations for the same technician impossible no matter
-- which code path (customer, admin, reschedule) writes them.
-- period = [start, end of service + buffer)
CREATE TABLE calendar_blocks (
  id             bigserial PRIMARY KEY,
  technician_id  bigint NOT NULL REFERENCES technicians(id),
  period         tstzrange NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('hold','booking')),
  hold_id        bigint UNIQUE REFERENCES slot_holds(id) ON DELETE CASCADE,
  booking_id     bigint UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  expires_at     timestamptz,   -- holds only
  CHECK ((kind = 'hold' AND hold_id IS NOT NULL AND expires_at IS NOT NULL)
      OR (kind = 'booking' AND booking_id IS NOT NULL)),
  CHECK (NOT isempty(period)),
  CONSTRAINT calendar_blocks_no_overlap EXCLUDE USING gist (technician_id WITH =, period WITH &&)
);

CREATE TABLE promotion_redemptions (
  id            bigserial PRIMARY KEY,
  promotion_id  bigint NOT NULL REFERENCES promotions(id),
  booking_id    bigint NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id   bigint NOT NULL REFERENCES customers(id),
  status        text NOT NULL CHECK (status IN ('reserved','consumed','released','forfeited')),
  saving_pence  int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_redemptions_promo_idx ON promotion_redemptions(promotion_id, status);
CREATE INDEX promotion_redemptions_customer_idx ON promotion_redemptions(customer_id, status);

-- ---------------------------------------------------------------------------
-- Media, gallery & testimonials
-- ---------------------------------------------------------------------------

CREATE TABLE media_assets (
  id            bigserial PRIMARY KEY,
  storage_key   text NOT NULL UNIQUE,   -- base key; variants stored as <key>/<width>.webp
  width         int NOT NULL,
  height        int NOT NULL,
  variants      int[] NOT NULL,         -- available widths
  alt_text      text NOT NULL DEFAULT '',
  caption       text,
  category      text,                   -- gallery filter: french, nude, nail-art, occasion, studio, ...
  focal_x       real NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y       real NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  usage         text NOT NULL DEFAULT 'gallery' CHECK (usage IN ('gallery','site','testimonial')),
  related_treatment_id bigint REFERENCES treatments(id),
  is_published  boolean NOT NULL DEFAULT false,
  is_featured   boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  provenance    text,                   -- where the image came from / licence
  is_example    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_gallery_idx ON media_assets(usage, is_published, sort_order);

-- Named image slots on the site (hero, about portrait, ...).
CREATE TABLE site_images (
  slot      text PRIMARY KEY,
  media_id  bigint REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE TABLE testimonials (
  id                bigserial PRIMARY KEY,
  display_name      text NOT NULL,
  quote             text NOT NULL,
  rating            smallint CHECK (rating BETWEEN 1 AND 5),
  media_id          bigint REFERENCES media_assets(id) ON DELETE SET NULL,
  booking_id        bigint REFERENCES bookings(id) ON DELETE SET NULL,
  source            text NOT NULL CHECK (source IN ('admin','customer')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','hidden')),
  is_featured       boolean NOT NULL DEFAULT false,
  consent_given_at  timestamptz,
  consent_note      text,
  is_example        boolean NOT NULL DEFAULT false,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  moderated_at      timestamptz,
  moderated_by      bigint REFERENCES admin_users(id)
);
CREATE UNIQUE INDEX testimonials_one_per_booking ON testimonials(booking_id) WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Enquiries, notifications, audit, rate limits
-- ---------------------------------------------------------------------------

CREATE TABLE enquiries (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  email       citext NOT NULL,
  phone       text,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Durable outbox. dedupe_key prevents duplicate messages for the same event.
CREATE TABLE notification_jobs (
  id               bigserial PRIMARY KEY,
  dedupe_key       text NOT NULL UNIQUE,
  kind             text NOT NULL,
  recipient        text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  booking_id       bigint REFERENCES bookings(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','sent','captured','failed','cancelled','skipped')),
  run_at           timestamptz NOT NULL DEFAULT now(),
  attempts         int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 6,
  locked_until     timestamptz,
  last_error       text,
  provider_message_id text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs(status, run_at);
CREATE INDEX notification_jobs_booking_idx ON notification_jobs(booking_id);

-- Messages captured by the development mailbox driver (not delivered externally).
CREATE TABLE dev_mailbox (
  id          bigserial PRIMARY KEY,
  job_id      bigint REFERENCES notification_jobs(id) ON DELETE SET NULL,
  recipient   text NOT NULL,
  subject     text NOT NULL,
  text_body   text NOT NULL,
  html_body   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id           bigserial PRIMARY KEY,
  actor_type   text NOT NULL CHECK (actor_type IN ('admin','customer','system')),
  actor_id     bigint,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    bigint,
  reason       text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);

-- Fixed-window rate limiter shared by all app instances.
CREATE TABLE rate_limits (
  bucket        text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
