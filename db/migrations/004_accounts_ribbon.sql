-- Customer accounts: optional, passwordless (a 6-digit code by email).
-- An account is a customers row with account_created_at set; guests who book
-- without signing in keep using the same table, so bookings made as a guest
-- appear in the account once that email signs in.
ALTER TABLE customers ADD COLUMN date_of_birth date
  CHECK (date_of_birth IS NULL OR (date_of_birth > '1900-01-01' AND date_of_birth < '2100-01-01'));
ALTER TABLE customers ADD COLUMN account_created_at timestamptz;

CREATE TABLE customer_login_codes (
  id           bigserial PRIMARY KEY,
  public_id    uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email        citext NOT NULL,
  code_hash    bytea,                       -- written when the email is rendered
  attempts     int NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  verified_at  timestamptz,                 -- correct code entered
  completed_at timestamptz,                 -- signed in (session created)
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_login_codes_email_idx ON customer_login_codes(email, created_at);

CREATE TABLE customer_sessions (
  token_hash   bytea PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_sessions_customer_idx ON customer_sessions(customer_id);

-- Announcement ribbon above the site header: a few rotating messages, each
-- optionally with an offer code (shown as a copyable tag) and a link.
CREATE TABLE announcement_ribbon (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled  boolean NOT NULL DEFAULT false,
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "text": "...", "code": "...", "href": "/book" }]
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO announcement_ribbon (id) VALUES (1);
