# Deployment, backups and restore

The app is a standard Node.js server (Next.js 16) with a PostgreSQL database. It needs:

| Piece | Requirement |
| --- | --- |
| Runtime | Node.js 20.9 or newer, one long-running process (`npm start`) |
| Database | PostgreSQL 14+ with the `btree_gist` and `citext` extensions (both are "trusted" extensions: managed Postgres from Neon, Supabase, Render, Railway, DigitalOcean, AWS RDS etc. allows them) |
| Image storage | A persistent disk for `STORAGE_DIR`, **or** an S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2) |
| Email | Any SMTP provider (Resend, Postmark, Amazon SES, Mailgun, Brevo...) with a verified sending domain |
| HTTPS | Terminated by your host or a reverse proxy (Caddy, nginx) |

## Recommended setups

**A. Single small server (VPS or a "web service" on Render/Railway/Fly.io) with managed Postgres.** Run the web process with `WORKER_IN_PROCESS=true`, so it also sends emails. With local image storage, attach a persistent volume and point `STORAGE_DIR` at it. On platforms without persistent disks, use the S3 driver.

**B. Serverless or multiple instances.** Use `STORAGE_DRIVER=s3`, set `WORKER_IN_PROCESS=false`, and either run `npm run worker` as a separate background worker, or call the cron endpoint every minute:

```
POST https://your-domain/api/cron/run-jobs
Authorization: Bearer <CRON_SECRET>
```

> Not verified in this build environment: Docker images, specific hosting platforms and real SMTP delivery (no provider credentials, and outbound access was restricted). The commands below are the ones the test suite exercises locally.

## Environment variables

Copy `.env.example` and fill in every value on the host. Never commit `.env`.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | `postgres://user:password@host:5432/dbname` (add `?sslmode=require` if your provider needs it) |
| `APP_URL` | Public base URL, e.g. `https://rugilenails.co.uk`. Used in email links. |
| `APP_SECRET` | 32+ random characters (`openssl rand -base64 48`). Keys verification codes and hashed IPs. Changing it invalidates codes in flight only. |
| `MAIL_DRIVER` | `smtp` in production. `devmailbox` stores emails in the database without sending. |
| `MAIL_FROM` | e.g. `Rugile Nail Atelier <bookings@rugilenails.co.uk>`, a sender your provider has verified |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | From your email provider. Port 587 with `SMTP_SECURE=false` (STARTTLS), or 465 with `true`. |
| `STORAGE_DRIVER` | `local` or `s3` |
| `STORAGE_DIR` | Local driver only: a persistent directory |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3 driver. `S3_ENDPOINT` for R2/B2, e.g. `https://<account>.r2.cloudflarestorage.com`. The bucket can stay private; images are served through the app. |
| `WORKER_IN_PROCESS` | `true` for a single instance |
| `CRON_SECRET` | Long random string if you use the cron endpoint |
| `TRUSTED_PROXY_COUNT` | Number of proxies in front of the app (usually `1` on Render/Railway/Fly or behind Caddy). Needed for correct per-visitor rate limits. |

## First deployment

```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed                 # example content; skip if you'll enter everything by hand
ADMIN_PASSWORD='a-long-unique-password' npm run admin:create -- --email rugile@example.com --name "Rugile"
npm start                       # listens on $PORT (default 3000)
```

Every later deploy: `npm ci && npm run build && npm run db:migrate`, then restart. Migrations are idempotent and run in transactions.

### Example: VPS with systemd and Caddy

```ini
# /etc/systemd/system/leonails.service
[Service]
WorkingDirectory=/srv/leonails
EnvironmentFile=/srv/leonails/.env
ExecStart=/usr/bin/npm start
Restart=always
User=leonails
[Install]
WantedBy=multi-user.target
```

```
# /etc/caddy/Caddyfile
rugilenails.co.uk {
  reverse_proxy localhost:3000
}
```

Set `TRUSTED_PROXY_COUNT=1` in that setup.

## Email setup

1. Create an account with an SMTP provider and add your domain.
2. Add the SPF, DKIM (and ideally DMARC) DNS records the provider gives you, and wait for verification.
3. Set the `SMTP_*` variables, `MAIL_FROM` and `MAIL_DRIVER=smtp`, then restart.
4. In **Admin > Settings > System**, email delivery should read "SMTP configured".
5. Make a real test booking to an inbox you control and confirm the verification code, confirmation and cancellation arrive. **Admin > Messages > Email delivery** shows each message as `sent`, or `failed` with the provider's error and a Retry button.

Emails are written to a durable outbox in the same transaction as the booking, so a provider outage never loses a booking. Failed sends retry with backoff (1, 2, 4, 8, 16 minutes) and then show as failed for a manual retry.

## Backups

`scripts/backup.sh` writes a compressed PostgreSQL dump and, for local storage, an archive of the image directory. It keeps the latest 30 of each.

```bash
BACKUP_DIR=/var/backups/leonails /srv/leonails/scripts/backup.sh
```

Schedule it nightly (cron: `15 3 * * * BACKUP_DIR=/var/backups/leonails /srv/leonails/scripts/backup.sh`), and **copy the backup directory off the server** (e.g. `rclone` to cloud storage). Managed Postgres providers also offer point-in-time recovery; enable it if available. With S3 storage, turn on bucket versioning.

## Restore

Tested in this environment with a dump of the development database.

```bash
# 1. Stop the app so nothing writes during the restore.
# 2. Restore the database into an empty database (create it first if needed):
createdb leonails_restored
pg_restore --no-owner --dbname "postgres://USER:PASS@HOST:5432/leonails_restored" /var/backups/leonails/db-YYYYMMDDTHHMMSSZ.dump
#    or, to overwrite the existing database in place:
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /var/backups/leonails/db-YYYYMMDDTHHMMSSZ.dump
# 3. Restore images (local storage only):
tar -xzf /var/backups/leonails/storage-YYYYMMDDTHHMMSSZ.tar.gz -C "$(dirname "$STORAGE_DIR")"
# 4. Point DATABASE_URL at the restored database if you used a new one, run `npm run db:migrate`, start the app.
```

After restoring, check **Admin > Today** and **Admin > Messages > Email delivery**. Emails that were pending at backup time will be sent when the app starts. Reminders for appointments that have already passed are skipped automatically.

## Before going public

See the launch checklist in [`STATUS.md`](STATUS.md#before-public-launch). Keep the site private (host-level password protection, or don't point the domain at it) while example prices and details are visible.
