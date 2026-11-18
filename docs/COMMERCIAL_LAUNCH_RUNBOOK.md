# FairMatch commercial launch runbook

FairMatch is launchable only when every gate below has named evidence and an owner. A successful build alone is not a launch approval.

## 1. Required infrastructure

- Vercel production and preview deployments use separate environment scopes.
- Supabase production uses migrations in numeric order and Row Level Security remains enabled on every private table.
- A custom domain is optional for product testing but required before branded SMTP and public marketing launch.
- The OpenAI key, future Stripe keys and future SMTP credentials stay in server-side environment variables. Never use a `VITE_` prefix for secrets.

## 2. Database and backup gate

- Apply migrations `013` through `017` in order and record the successful SQL result.
- Before every destructive migration, create or confirm a restorable Supabase backup.
- Before public launch, use a Supabase plan that provides the recovery objective required by the business; free-tier recovery is not a commercial backup strategy.
- Quarterly drill: restore to a separate project, validate authentication, tenant isolation, applications, documents, audit history and storage object references.

## 3. Security gate

- Run all automated tests and the production build.
- Verify anonymous calls cannot read profiles, documents, attempts, applications, organisation records or audit data.
- Validate candidate, college coordinator/admin, company HR/admin and platform-admin accounts separately.
- Store dedicated test-account credentials only in `.env.local` or protected CI secrets, then run `npm run verify:roles`. This must pass for all eight roles before public approval.
- For an isolated temporary matrix, set `SUPABASE_SECRET_KEY` and `FAIRMATCH_TEST_BASE_EMAIL` locally, then run `npm run verify:roles:provisioned`. It creates confirmed Gmail-alias identities, verifies all roles, and removes the temporary users and tenants afterward.
- Confirm document links expire and a company cannot access another company's candidate attachments.
- Review Supabase Auth attack protection, password policy, session duration and MFA policy for elevated administrators.
- Run dependency, secret and web security scanning before each release.

## 4. Email and domain gate

- Buy or connect the final domain.
- Configure the Supabase Site URL and exact production redirect allow-list.
- Configure a transactional provider with SPF, DKIM and DMARC. Do not use consumer Gmail SMTP for production SaaS delivery.
- Test sign-up confirmation, resend, password recovery, email change and invitation delivery to Gmail, Outlook and one institutional domain.

## 5. Billing gate

- Approve plan pricing, GST/tax treatment, refund terms and cancellation terms.
- Create Stripe products/prices only after the commercial terms are final.
- Implement signed webhook verification and idempotency before changing subscription status automatically.
- Until then, subscriptions remain explicitly `manual`; the UI must not claim automatic billing.

## 6. Monitoring and incident gate

- Monitor `/api/health` for liveness and `/api/readiness` for Supabase Auth plus AI configuration.
- Connect an error-monitoring provider and an external uptime monitor before public traffic.
- Alert on elevated 5xx rates, readiness failures, authentication abuse, AI limit rejections and database/storage errors.
- Incident roles: incident lead, technical responder, communications owner and privacy owner.
- Preserve audit evidence, contain access, rotate affected secrets, notify impacted parties where legally required, document remediation and only then close the incident.

## 7. Release and rollback

1. Apply approved database migrations and verify them with authenticated and anonymous test accounts.
2. Deploy a Vercel preview and run role-based smoke tests.
3. Promote the immutable build to production.
4. Verify security headers, liveness, readiness, sign-in, one full application workflow and one admin audit workflow.
5. If a critical gate fails, roll back the Vercel deployment. Use forward database fixes unless a reviewed rollback migration exists.

## 8. Public-launch approval record

Record the production URL, build/deployment ID, migration versions, test report, security reviewer, backup evidence, email evidence, billing mode, incident contacts, launch approver and approval time.
