# FairMatch MVP deployment architecture

```text
React web (Vite) ─┐
                  ├─ Vercel Node API (/api/v1) ─ managed MySQL 8
Kotlin Android ───┘                 │
                                    └─ optional AI and email providers (server-only)
```

Web browsers and Android never connect to MySQL. Web uses a short-lived access token plus an HTTP-only refresh cookie. Android uses the same API and stores tokens with Android encrypted storage.

## Required Vercel variables

- `DATABASE_URL`
- `JWT_SECRET` (unique high-entropy secret, at least 32 characters)
- `APP_ORIGIN` (deployed web domain)
- `ANDROID_APP_ORIGIN=fairmatch://auth`
- `NODE_ENV=production`

Database credentials, JWT secrets and AI keys must never be included in `VITE_*` variables or Android build settings.

Run `database/mysql/001_fairmatch_mvp.sql` against a new MySQL 8 database before first deployment. Take a backup before every future migration.

Create the initial governance account exactly once after the schema is applied. Supply `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL` and a 16+ character `BOOTSTRAP_ADMIN_PASSWORD`, then run `npm run bootstrap:platform-admin`. Do not put those bootstrap values in source control or Vercel's public environment settings.

## Launch gates still required

- Transactional email provider for verification and password recovery.
- Managed MySQL instance, production seed/admin bootstrap, backup and restore test.
- End-to-end browser and Android emulator tests against a Vercel preview.
- AI provider choice, consent text, rate limit and red-team evaluation.
- Legal pages, support process, monitoring and incident runbook.
