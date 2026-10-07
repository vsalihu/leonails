# Temporary hosting on Railway (everything working)

This puts the full site online at a `https://….up.railway.app` address: booking, email codes, the private appointment page, admin sign-in, uploads and the hero video. It takes about 20 minutes. Nothing needs to be installed on your computer.

**Why Railway:** the app needs three things a "static" host can't give it: a Node.js server, a PostgreSQL database, and a disk that keeps uploaded photos. Railway provides all three in one project. A new account gets a one-time **$5 trial credit** (a card may be requested); after that the Hobby plan is **$5/month including $5 of usage**, which a site this size normally stays within.

The app is already set up for this:

* `railway.json` tells Railway to start with `npm run start:prod`, which applies database updates, adds the example content once, creates the first admin, then starts the site.
* Images are saved to a Railway **volume**, so they survive restarts and redeploys.
* `SITE_NOINDEX=true` keeps the temporary site out of Google while example prices are visible.

---

## 1. Get an email account ready for sending (5 minutes)

Customers receive a 6-digit code before they can book, so the site must be able to send email. For a temporary setup, a Gmail account works well:

1. Use (or create) a Gmail account for the business, e.g. `rugilenails@gmail.com`.
2. Turn on **2-Step Verification**: Google Account → Security.
3. Open **App passwords** (search "App passwords" in your Google Account settings), create one called "Website", and copy the 16-character password. Remove the spaces.

Gmail allows a few hundred messages a day, plenty for a temporary site. For the permanent launch, switch to a provider with your own domain (Resend, Postmark, Brevo). Only the email settings change.

> Skipping email? Leave out the `MAIL_`/`SMTP_` variables below. Everything else works, but verification codes are only visible in **Admin → Messages → Development mailbox**, so customers can't finish a booking on their own.

## 2. Create the Railway project (5 minutes)

1. Go to **railway.com** and sign in with **GitHub** (the account that owns `vsalihu/leonails`).
2. **New Project → Deploy from GitHub repo →** choose `leonails`. Allow Railway access to the repository if asked.
3. The first build may fail or the site may not start yet. That's expected; it has no settings yet.
4. Click the new service → **Settings → Source**, and set **Branch** to `claude/stoic-pasteur-dmwacw` (or `main` if you've merged it).

## 3. Add the database

In the project canvas: **+ Create → Database → PostgreSQL**. Railway creates it and wires up private networking. Nothing else to configure; the app creates its own tables and extensions.

## 4. Add a volume for photos

Right-click the **leonails** service (or **+ Create → Volume**) → **Attach volume** → mount path:

```
/data
```

## 5. Give the site a public address

Service → **Settings → Networking → Generate Domain**. If it asks for a port, accept the suggested one (the app listens on whatever `PORT` Railway provides). You'll get something like `leonails-production.up.railway.app`.

## 6. Add the variables

Service → **Variables → Raw Editor**, paste this, and replace the values in angle brackets:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
APP_SECRET=<48+ random characters from a password generator>

STORAGE_DRIVER=local
STORAGE_DIR=/data/storage
WORKER_IN_PROCESS=true
TRUSTED_PROXY_COUNT=1
SITE_NOINDEX=true

ADMIN_EMAIL=<the email Rugile will sign in with>
ADMIN_PASSWORD=<a long password, 12+ characters>
ADMIN_NAME=Rugile

MAIL_DRIVER=smtp
MAIL_FROM=Rugile Nail Atelier <your.gmail@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your.gmail@gmail.com
SMTP_PASSWORD=<the 16-character app password, no spaces>
```

Notes:

* `${{Postgres.DATABASE_URL}}` and `${{RAILWAY_PUBLIC_DOMAIN}}` are filled in by Railway; type them exactly. If your database service has a different name than `Postgres`, use that name.
* **Don't** set `NODE_ENV`. Railway would apply it to the build too and skip the build tools.
* `MAIL_FROM` must use the same Gmail address as `SMTP_USER`.

Click **Deploy** (Railway also redeploys automatically when variables change).

## 7. Watch the first start (2 to 3 minutes)

Service → **Deployments → View logs**. On the first start you'll see:

```
applied 001_init.sql … applied 003_media_video.sql
seeded: settings … seeded: owner-gallery-2026-10 … seeded: example-testimonials
[admin] created rugile@…
✓ Ready
```

Preparing the photos takes a minute or two the first time only. Later deploys start in seconds, and nothing you change in the admin is ever overwritten.

## 8. Check everything works

1. Open `https://<your-domain>`: the homepage shows the real photos.
2. Open `https://<your-domain>/admin` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Admin → Settings → System** should say *Email delivery: SMTP configured*.
4. **Admin → Settings → Business**: put your own email in *Send booking and enquiry alerts to*.
5. **Admin → Settings → Account**: change the password. Then you can delete `ADMIN_PASSWORD` from Railway's variables (the account stays; the variable is only used to create it once).
6. Make a test booking on your phone with a real email address: you should receive the code, then the confirmation with the appointment page link. Cancel it from that page.
7. In **Admin → Messages → Email delivery**, each email should show **Sent**. A **Failed** entry shows Gmail's reason (usually a wrong app password).

The **Before launch** panel on Admin → Today lists the example content still to replace (prices, hours, address, policies).

## Day-to-day

* **Updating the site:** push to the branch Railway watches; it rebuilds and redeploys automatically.
* **Backups:** check the Postgres service for a **Backups** tab (availability depends on your Railway plan). You can always run `scripts/backup.sh` from any computer with `DATABASE_URL` set to the database's *public* connection URL (Postgres service → Variables → `DATABASE_PUBLIC_URL`).
* **Custom domain later:** Service → Settings → Networking → **Custom Domain**, add the DNS record Railway shows, then change `APP_URL` to `https://yourdomain.co.uk`.
* **Going public:** finish the launch checklist in `docs/STATUS.md`, set `SITE_NOINDEX=false`, and switch email to a provider on your own domain.
* **Taking it down:** Project → Settings → **Delete project** removes the site, database and photos.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Deploy log: `Invalid environment configuration` | A required variable is missing or malformed. The message names it (`APP_SECRET` must be 32+ characters; `APP_URL` must start with `https://`). |
| Deploy log: `DATABASE_URL is not set`, container keeps restarting | The variable isn't on the **app** service. Open the leonails service (not Postgres) → **Variables → New Variable → Add Reference →** your PostgreSQL service → `DATABASE_URL`. If you typed `${{Postgres.DATABASE_URL}}`, `Postgres` must match the database service's name exactly. Then press **Deploy** on the staged changes banner. |
| `ECONNREFUSED` / database errors | `DATABASE_URL` must be `${{Postgres.DATABASE_URL}}` (match your database service's name). |
| Can't sign in to admin | Check `ADMIN_EMAIL`/`ADMIN_PASSWORD` were set **before** the first successful start, and the password is 12+ characters. Otherwise use **Forgotten your password?** (needs email working). |
| Emails show **Failed** | Wrong `SMTP_PASSWORD` (must be an *app password*, no spaces) or `MAIL_FROM` doesn't match `SMTP_USER`. Fix the variable, then press **Retry** in Admin → Messages. |
| Uploaded photos disappear after a deploy | The volume isn't attached at `/data`, or `STORAGE_DIR` isn't `/data/storage`. |
| Booking emails link to the wrong address | `APP_URL` must be the public `https://` address. |
