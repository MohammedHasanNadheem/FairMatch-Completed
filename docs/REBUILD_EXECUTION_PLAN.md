# FairMatch rebuild execution plan

The existing application is retained only as a workflow reference. The rebuild uses React web, Kotlin Android, Vercel Node functions and managed MySQL, delivered in tested vertical slices.

## Product contract

One account has one active FairMatch role at a time. Higher-trust roles require approval. Every role shares a common event history, notifications, privacy controls and explainable-AI policy, but never receives another tenant's data.

| Slice | Android priority | Web priority | Server responsibility |
| --- | --- | --- | --- |
| Identity | candidate sign-up, recovery, device session | all roles, approval status | Node API, signed sessions and MySQL records |
| Candidate | home, guidance, roles, applications, alerts | resume/profile editor, full discovery | matching explanation and document authorisation |
| Company | hiring alerts, interview feedback | jobs, pipeline, offers, team controls | permission, audit and fair-hiring guardrails |
| College | student status and alerts | cohorts, drives, eligibility, outcomes | tenant-scoped aggregate reporting |
| Platform | incident and approval alerts | approvals, audit, organisation operations | trusted governance actions |

## Phase 1: foundation (current)

- Original mobile and web design system: ink, warm canvas, coral and signal-lime tokens.
- Shared eight-role product contract, with approval boundaries for college/company/platform operators.
- Native Android Kotlin/Jetpack Compose project created under `apps/android`.
- Android onboarding/role/workspace foundation is present without privileged credentials.
- React web and MySQL-backed Vercel API build successfully.

## Phase 2: identity and secure connection

1. Add Node API Android auth with encrypted session persistence and deep-link callback handling.
2. Finish web Google OAuth, password reset, email confirmation and pending-access state.
3. Add a Node API authentication middleware shared by all protected server endpoints.
4. Add account/organisation approval UX and associated integration tests.

## Phase 3: candidate vertical slice

1. Profile, skills, preferences, consent and private document vault.
2. Search, filters, saved opportunities and explainable matching.
3. Application creation, validation, status timeline and notifications.
4. Role-specific AI Guide using the existing server-only, consented endpoint.

## Phase 4: institution and company operations

1. College cohorts, placement drives, eligibility and outcomes.
2. Company opportunities, review pipeline, structured interviews and offers.
3. Candidate notification and accepted-offer tracking.
4. Platform approvals, audit controls and organisation team management.

## Phase 5: launch qualification

- Unit, integration, MySQL tenant-authorisation and end-to-end tests for every role.
- Android emulator/device matrix, accessibility and poor-network tests.
- Web Core Web Vitals, Vercel preview, custom domain, MySQL backup and monitoring.
- Privacy policy, consent design, backup/restore test, incident runbook and Play Console release checklist.

## AI non-negotiables

AI runs through Node API routes only. The web and Android clients send an authenticated request to FairMatch, not an AI provider. Inputs are minimised, direct identifiers removed, every output uses a structured explainability card, requests are rate limited and auditable, and AI cannot make final employment, admission, scholarship or disciplinary decisions.
