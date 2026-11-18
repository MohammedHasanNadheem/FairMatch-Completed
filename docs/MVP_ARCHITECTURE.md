# FairMatch MVP architecture

## Product boundary

The MVP ships one secure, connected loop:

```text
Candidate profile → discover role → apply → company review → candidate update
                                  ↘ college cohort visibility ↗
Platform administrator approves every elevated organisation role
```

The MVP deliberately does not launch a public social network, marketplace data
scraping, a complex microservice estate, or unapproved AI processing.

## Deployment shape

```text
React + Vite web app (Vercel HTTPS)
        │
        ├── Supabase Auth        email verification, later Google OAuth
        ├── Supabase Postgres    tenant-scoped application data + RLS
        ├── Supabase Storage     resumes/documents (next release)
        └── Node API             AI and privileged integrations only
                                  (no secret is exposed to the browser)
```

The web app is static and low-latency. Supabase performs identity, database,
row-level access control, and real-time-ready notifications without a custom
database server. The Node API stays small until a task truly requires a secret
or a trusted server-side integration.

## MVP users and outcomes

| User | MVP outcome |
|---|---|
| School student | Creates a private profile and sees guided next actions. |
| College student | Completes profile, joins an authorised cohort, discovers roles, applies, tracks interviews, responds to offers, and receives status updates. |
| Job seeker | Sets search profile, discovers roles, applies, and tracks outcomes. |
| College coordinator/admin | Creates cohorts, issues/revokes join codes, and sees only authorised placement activity. |
| Company HR/admin | Creates and publishes roles, reviews applicants, schedules interviews, and issues offers. |
| Platform administrator | Approves elevated access, manages account/membership status, and reads the audit trail. |

## Front-end feature modules

```text
apps/web/src
├── AuthDialog.tsx               registration, sign-in, recovery
├── WorkspaceShell.tsx           role-aware navigation and account shell
├── CandidateWorkspace.tsx       profile readiness, cohort join, applications
├── OpportunityBoard.tsx         browse and submit application
├── OrganisationWorkspace.tsx    company/college operating workflows
├── AdminConsole.tsx             platform approval and access governance
├── NotificationCenter.tsx       user-visible connected updates
└── ProfileEditor.tsx            candidate-controlled profile data
```

Each module reads only Supabase data permitted by row-level security. The UI is
not the security boundary; it merely reflects the role permissions enforced in
Postgres.

## Database release order

1. `001` to `005`: identity, roles, catalogue, applications, placement core.
2. `006`: platform account, organisation, membership, and audit controls.
3. `007`: college visibility rules.
4. `009`: safe connected-workflow repair after the failed `008` attempt.
5. `010`: offer-decision audit and recruiter notification.

Do not run the older failed `008` migration again.

## MVP acceptance tests

1. Candidate cannot access platform, college, or company data.
2. A company role cannot operate until approved by a platform administrator.
3. A company can publish a role; a candidate can submit once; the company can
   shortlist or decline; the candidate receives a notification.
4. A college student can join only a valid, active cohort code; a college can revoke it immediately.
5. A company can schedule an interview or issue an offer only for an authorised applicant; the candidate can see details and respond privately.
6. Suspending an account immediately removes organisation access.
7. Platform administrators can see decisions and reasons in the audit trail.
8. No browser bundle contains a service-role key or AI-provider key.

## Not in the first public test release

- Google OAuth until its credentials and redirect domain are configured.
- Resume file storage until the private bucket policies and download rules are
  tested.
- Calendar integration, advanced reporting, bulk import, and payments.
- Real AI requests until the owner approves data sharing and configures the
  server-side provider key.

These are planned follow-on modules, not omissions in the architecture.
