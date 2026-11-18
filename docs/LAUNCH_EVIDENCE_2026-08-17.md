# FairMatch launch evidence — 17 August 2026

## Release under review

- Production URL: `https://fairmatch-platform.vercel.app`
- Vercel deployment: `dpl_4E5iAZmz13sWvPqY6JxiRszziPEG`
- Deployment state: `READY`, production alias active
- Database migrations: `001` through `017`; migrations `013`–`017` independently observed through the production Supabase API

## Passed engineering gates

- Production build: passed
- Automated tests: 32 passed (3 API policy tests and 29 web tests)
- Expanded live launch audit: 29/29 passed
- Authenticated role matrix: 24/24 passed across all eight roles; temporary identities and tenants removed after verification
- Liveness and dependency readiness: passed
- AI server configuration: ready; anonymous requests rejected with HTTP 401
- Security headers: CSP, HSTS, nosniff, deny framing, strict referrer policy, permissions policy and COOP present
- Private-data RLS probes: anonymous reads returned zero profile, application, document, assessment, evidence, privacy-request and audit rows
- Candidate document bucket: private; anonymous listing returned zero objects
- Versioned production assets: one-year immutable cache active
- Entry JavaScript transfer: 424 KiB, under the 586 KiB launch budget
- Production root latency at final audit: 816 ms, under the 2,000 ms launch budget
- Dependency audit during Vercel build: zero npm vulnerabilities reported

## Built commercial capabilities

- Eight role-aware workspaces and read-only platform-admin role preview
- Supabase authentication, central role approval, tenant membership and audit records
- Candidate profiles, document vault, explainable opportunity matching, saved roles/searches, applications, interviews and offers
- College cohorts, placement operations, company opportunities and candidate-review workflows
- Server-only explainable AI with prompt minimisation, role/context restrictions, moderation, youth-safe mode and governance controls
- Skill assessments with server-side scoring and verified evidence
- In-app notifications and saved-search alerts
- Organisation reports, CSV export protection, SaaS entitlements and manual pilot subscriptions
- Account/privacy requests for export, correction, deletion and consent withdrawal
- Error recovery, health/readiness endpoints, CI quality workflow and rollback runbook

## Evidence still required before public commercial approval

1. **Visual E2E** — validate sign-up, confirmation, sign-in/out, password recovery and the principal candidate → company → offer workflow on desktop and mobile. The desktop browser-control connection was unavailable during this audit, so this is not marked passed.
2. **Email deliverability** — final domain, transactional SMTP, SPF, DKIM and DMARC; evidence from Gmail, Outlook and an institutional mailbox.
3. **Backup/recovery** — a Supabase commercial recovery plan and one documented restore drill to a separate project.
4. **Monitoring/incident response** — external uptime and error monitoring connected to named responders and tested alert delivery.
5. **Commercial terms** — approved pricing, GST/tax, refunds and cancellation terms before Stripe automation is enabled. Current subscription mode remains intentionally manual.
6. **Final domain** — optional for pilot testing, required for branded public marketing and SMTP launch.

## Decision

**Approved for controlled pilot testing on the Vercel URL. Not yet approved for unrestricted public commercial launch.**

Public approval requires all six evidence items above, a named launch approver and an approval timestamp.
