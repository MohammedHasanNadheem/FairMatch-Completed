# FairMatch deployment guide

FairMatch deploys as one Vercel project: Vite builds the React web client and Vercel serves the Node functions in `api/`. MySQL is a separate managed service; it must accept TLS connections from Vercel.

## 1. Prepare MySQL

1. Create a MySQL 8 database and a least-privilege application user.
2. Apply `database/mysql/001_fairmatch_mvp.sql` once.
3. Keep the connection URL private. It belongs only in Vercel's encrypted environment settings.

## 2. Configure Vercel

Import this repository and set the production variables:

```text
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
JWT_SECRET=<unique random value, 32+ characters>
APP_ORIGIN=https://your-domain.vercel.app
ANDROID_APP_ORIGIN=fairmatch://auth
NODE_ENV=production
```

Do not add `DATABASE_URL`, `JWT_SECRET`, email credentials, or AI-provider keys to any `VITE_*` value.

Vercel uses the repository `vercel.json`, runs `npm ci`, and builds the web client with `npm run build --workspace=@fairmatch/web`.

## 3. Establish platform administration

After the database schema exists, run the one-time bootstrap from a trusted local terminal. Set `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD`, then run:

```text
npm run bootstrap:platform-admin
```

Sign in as that account, then approve verified college and company requests from Platform administration.

## 4. Verify preview before production

1. Register candidate and organisation accounts.
2. Approve the organisation account using the platform administrator.
3. Create and publish an opportunity as company HR.
4. Apply as a college student or job seeker.
5. Review the application as company HR.
6. Confirm the candidate only sees their own record.
7. Sign out, refresh, and sign in again.

## 5. Configure public launch dependencies

Before public launch, configure a transactional email provider for verification and password recovery, perform a backup/restore exercise with MySQL, run browser and Android emulator end-to-end tests, publish legal/support pages, and enable uptime/error monitoring.

The older Supabase documents and migrations are retained only as historical reference and are not part of this deployment path.

## Android release

Open `apps/android` in Android Studio, set `FAIRMATCH_API_BASE_URL` in local Gradle properties to the deployed HTTPS Vercel URL, then generate a signed Android App Bundle (`.aab`). Use Play Console internal testing before production rollout. The Android app never receives MySQL, JWT, email-provider or AI-provider credentials.
