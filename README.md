# Fairmatch Platform

The product is organised as an MVP-first, multi-tenant career SaaS. The active
architecture is React web + Kotlin Android + Vercel Node API + managed MySQL.
See [MySQL/Vercel architecture](docs/MYSQL_VERCEL_ARCHITECTURE.md) for the
deployment boundary and production launch gates.

Production rebuild of the Fairmatch placement and career-management portal.

Fairmatch supports school career discovery, college internships and placements,
experienced job seekers, college operations and company recruitment. See
[`docs/product-model.md`](docs/product-model.md) for the portal model,
explainable-AI standard, safety boundaries and revised delivery plan.

Guided Mode and ATS readiness are currently private, deterministic and
explainable: they run within FairMatch and do not send profile data to an
external AI provider. Any future provider integration requires explicit user
consent, minimised prompts, server-only credentials, rate limits and a
completed safety evaluation before it is enabled.

## Phases

1. Foundation: React/TypeScript web app, Kotlin Android app, Vercel Node API and managed MySQL schema.
2. Identity and access: email/password sessions, organisation tenancy, platform-admin approvals and audit events.
3. Opportunity workflow: private profiles, internships/jobs, applications, shortlists and clear candidate history.
4. College operations: cohorts, drives, scheduling, employer management and outcomes (next module).
5. Intelligence and operations: private explainable Guided Mode, notifications, reporting, imports and production quality checks.

The original static prototype remains untouched at `D:\FairMatch-main` while this implementation is built here.
