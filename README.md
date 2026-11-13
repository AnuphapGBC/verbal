# Verbal

A full-stack language-tutor marketplace inspired by Preply. React + Vite frontend, Express API, and Neon PostgreSQL. Reservations are **pay later**, as requested; the app does not collect card details or charge anyone.

The interface now has its own language-club identity: cream, deep teal, coral, a conversation-mark logo, labelled filters, and a full browsable tutor list. Learner pages highlight the next real lesson, while teaching and admin pages share the same readable workspace. Booking shows a local date, time, price, and confirmation; messages keep unsent drafts when switching conversations or refreshing. The visual and accessibility direction is documented in `DESIGN.md`.

## Start

Requirements: Node.js 22.12+ and npm. This workspace already has a private `.env`, migrated database, and sample tutor data.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. One command starts both the frontend and API on port 3001. Frontend changes reload automatically. Restart the command after backend changes. Stop with Ctrl+C.

For another checkout or database, copy `.env.example` to `.env`, set `DATABASE_URL`, and initialize it:

```sh
npm run db:inspect
npm run db:migrate
npm run db:seed
npm run dev
```

The connection string belongs only in server environment variables. Never give it a `VITE_` prefix. `.env` files are ignored by Git. No database credential or session token is placed in browser storage.

## Included flows

- **Accounts:** sign up, log in/out, seven-day server-side sessions, change passwords, edit learning goals, export account data, and delete an account after cancelling upcoming lessons.
- **Discovery:** database-backed language, price, and name/headline filters, tutor profiles, language categories, and account-specific saved tutors.
- **Scheduling:** tutors publish 50-minute slots up to 90 days ahead; learners reserve at the server-side price, view lessons, and cancel before the start. UTC instants are displayed in the visitor's local timezone.
- **Teaching:** self-published tutor profiles, pricing, availability management, learner reservations, and completion after the lesson end time. Tutor profiles are not independently verified.
- **Messages:** private learner/tutor conversations with automatic refresh. Learners can contact a real tutor before booking; tutors can reply to a conversation or contact their booked learner. Arrange the actual meeting method in messages.
- **Reviews:** only the learner of a completed lesson can publish one review for it. Public tutor ratings/counts come from those reviews and are recalculated after account deletion.
- **Administration:** a protected admin overview of accounts, tutors, and lessons; admins can pause/resume tutor listings. Pausing stops new reservations and discovery while existing lessons and private conversations remain accessible. Public signup cannot assign the admin role.

## Test accounts

Run `npm run db:test-users` to create one admin, two tutors, and two students in the configured database. These five persistent accounts have unique randomly generated passwords stored in **`.env.test-accounts.json`** in this folder. That file is excluded from Git and Vercel uploads; it is not included in the browser bundle or any API response.

| Role | Email |
| --- | --- |
| Admin | `admin@test.verbal.invalid` |
| English tutor | `tutor.english@test.verbal.invalid` |
| Spanish tutor | `tutor.spanish@test.verbal.invalid` |
| Student | `student.one@test.verbal.invalid` |
| Student | `student.two@test.verbal.invalid` |

The addresses intentionally do not receive mail. Use the email/password pairs to log in normally. The admin opens `#/admin`; tutors use Teaching; students use My lessons. Both tutor profiles explicitly identify themselves as test profiles and start with two available slots per day for the next 14 days. These are functional accounts for booking and messaging tests, and no real lesson is offered.

The script preserves existing test passwords and data on re-runs and extends availability without duplicating slots. It refuses to overwrite real users, changed test passwords, or mismatched fixture identities. Keep the credential file if you want to rerun the script. `npm run check:test-users` verifies sign-in and permissions for the five accounts without making reservations or changing their passwords.

The database's internal student role is named `learner`. Admin accounts are provisioned only through the trusted server-side seed script, not through signup or profile edits. A hosted admin dashboard requires deployment of the latest code; creating accounts in PostgreSQL alone does not update the deployed frontend.

Six starter profiles and their availability/reviews are explicitly marked **sample**. Their reservations test the app; no real lesson takes place, and sample profiles cannot receive messages. Create a tutor account to publish a real profile; open a separate browser profile/private window for a learner account to try both sides.

## Database

Tables live in the isolated `verbal` schema: `users`, `sessions`, `tutors`, `availability`, `bookings`, `saved_tutors`, `messages`, `reviews`, `login_attempts`, and `schema_migrations`. Existing schemas are preserved.

Migrations are versioned, checksummed, transactional, and locked across concurrent runs. Do not edit an applied migration; add a numbered SQL file. Runtime uses the supplied pooled connection. Migrations use `DIRECT_DATABASE_URL` when configured, otherwise the same endpoint without its `-pooler` suffix. TLS certificate verification and channel binding are enabled.

Seeding is idempotent and adds 21 days of sample availability. Run it again to extend that sample schedule; real tutors manage their own schedule. Bookings have a unique active-slot index, server-side ownership checks, and a shared transactional scheduling lock to prevent slot and participant overlaps. Scheduling writes are serialized, appropriate for this initial app; higher-volume deployments can replace this with participant-level locks.

Passwords use salted scrypt hashes. Sessions use random HttpOnly, SameSite cookies backed by hashed tokens in PostgreSQL. Production cookies are Secure. Auth rate limits use shared database counters; password changes invalidate other sessions. API requests are validated, queries are parameterized, unsafe browser origins are rejected, and production responses include security headers. Expired sessions and rate-limit records are removed hourly by the production server.

## Verify

```sh
npm run build
npm audit
npm run test:db
npm run check:production
```

Integration tests use three uniquely named temporary accounts in the configured database. They exercise the real API, cancel reservations, and remove their own accounts. Tests cover sessions, password changes, origin checks, validation, access isolation, concurrent/overlapping reservations, tutor publishing, messaging, export/deletion, completion, and real reviews. A test moves one of its own lesson fixtures into the past to exercise completion. They never update other users' data. `npm test` skips the database suite unless `RUN_DB_TESTS=1` is set; `npm run test:db` sets that opt-in explicitly.

While `npm run dev` is running, `npm run smoke` checks the frontend, Vite API proxy, filters, and database health. Browser visual QA was unavailable in the build environment.

`npm test` also runs frontend interaction checks with a simulated DOM and mocked API responses: password visibility, booking date pagination and conflict recovery, tutor list/filter behavior, and message draft retention. These tests do not access the database. They complement the production build and API checks; native visual browser approval timed out during the redesign, so rendered responsive screenshots were not verified.

## Production

### Vercel

The repository includes a Vite frontend and `api/[...path].js` for the Express backend. Keep the **Vite** framework preset. The function preserves `/api/*` URLs, and `vercel.json` excludes API requests from the SPA fallback.

Add these variables to the **Production** environment, then deploy the latest code:

| Key | Type | Value |
| --- | --- | --- |
| `DATABASE_URL` | Secret | The PostgreSQL connection URL from your private `.env`; omit the `psql` command and surrounding quotes. |
| `APP_ORIGIN` | Config | Your exact production HTTPS origin, e.g. `https://verbal-fawn.vercel.app`, without a trailing slash. |
| `NODE_ENV` | Config | `production` |

`PORT` and `DIRECT_DATABASE_URL` are not required by the Vercel runtime. Do not prefix `DATABASE_URL` with `VITE_`. The database is already migrated; deployment does not run migrations or seeds. Give previews their own database and matching `APP_ORIGIN` rather than sharing production credentials. Changing Vercel variables requires a new deployment. This local adapter has not been deployed automatically.

The Vercel adapter trusts the platform proxy for client-IP rate limits; no extra `TRUST_PROXY` variable is needed there. `.vercelignore` also excludes private environment files from CLI uploads.

The standalone server's hourly cleanup loop does not run inside Vercel Functions. Session expiry and rate-limit reset are enforced on every request, so expired records cannot authenticate or extend a throttle; pruning old records on Vercel would require a scheduled maintenance job.

### Standalone Node server

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Configure `DATABASE_URL`, `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`, and optionally `PORT`. Serve the Express process behind an HTTPS reverse proxy. The server serves `dist/` and `/api` from the same origin. Set `TRUST_PROXY=1` only behind exactly one trusted proxy that replaces forwarded client headers. Run the seed only if sample profiles are wanted.

`npm run preview` previews the static frontend build only; use `npm start` for the complete app. Client/server dependencies install with lifecycle scripts disabled in `.npmrc`; the prebuilt esbuild binary is supplied as an optional platform dependency.

Portraits load from Unsplash and fonts from Google Fonts, with local avatar/system-font fallbacks. No email service, password recovery email, integrated video classroom, or online payment processor is configured. The app uses password sign-in, in-app messages, externally arranged lessons, and pay-later reservations. No external notification or payment is implied by a reservation.
