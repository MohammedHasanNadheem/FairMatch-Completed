# Fairmatch product model

Fairmatch is a role-based career ecosystem. It supports career exploration before college, placement operations during college, and direct employment after graduation. Each user only sees data owned by, shared with, or explicitly assigned to their organisation.

## Portals and outcomes

| Portal | Primary outcome | Core capabilities | AI assistant scope |
| --- | --- | --- | --- |
| School student | An informed career and education path | Interests, subjects, career paths, course and scholarship research, milestones, counsellor referrals | Explains possible paths, required subjects, skills, evidence and next steps. It never presents a career as guaranteed. |
| College student | Internship, placement and career readiness | Profile, verified skills, resume, opportunities, eligibility, applications, interview preparation and offers | Explains job fit, missing requirements, application improvements and a personal preparation plan. |
| Experienced job seeker | Relevant, trustworthy job search | Work history, portfolio, preferences, job matching, applications, referrals and interview preparation | Explains each job match from skills, experience and stated preferences; flags gaps without ranking people as "good" or "bad". |
| College coordinator | Controlled placement and internship delivery | Cohorts, eligibility, employer drives, candidate shortlists, scheduling, intervention tracking, outcomes and reports | Summarises cohort readiness and recommends support actions with the underlying data and filters shown. |
| College administrator | Institution oversight | Coordinator management, programme configuration, employer relationships, reports, audit and consent controls | Explains trends and data quality issues; never makes disciplinary or admission decisions. |
| Company HR | Fair, efficient hiring | Company profile, vacancies, eligibility rules, candidate pipeline, interviews, offers and feedback | Creates explainable candidate-to-role comparisons. AI cannot reject a candidate or send an offer. |
| Company administrator | Company governance | HR users, approval flows, templates, reporting and audit | Explains funnel and hiring trends using only the company’s authorised data. |
| Platform administrator | Secure multi-tenant operations | Tenant setup, approvals, policy, support, moderation and audit | Investigates platform-level operational questions without exposing tenant data across organisations. |

## Explainable AI standard

Every recommendation produced in Fairmatch must include an explanation card:

1. **Recommendation** — the suggested career path, job, candidate action or operational insight.
2. **Why it was shown** — only the factual profile, preference, eligibility or job criteria used.
3. **Strengths and gaps** — clear matched evidence and missing or unverified items.
4. **Confidence and limits** — a plain-language confidence band and what information could change the result.
5. **Next actions** — practical steps the user can take, plus the option to ask a counsellor, coordinator or recruiter.
6. **Sources** — links or records used for grounded advice, when Fairmatch supplies approved knowledge-base material.

AI output is advisory. It may not autonomously reject applicants, make hiring/admission decisions, decide scholarships, or expose private candidate, college or company information. Every AI response is labelled as AI assistance and has a report/correction action.

## Product principles

- **Private by default:** Candidates control profile visibility. Employers only see information supplied with an application or explicitly shared by the candidate.
- **Tenant isolation:** College and company data is separated using Supabase Row Level Security and server-side checks.
- **Human decision maker:** HR, coordinators and authorised administrators make final decisions.
- **Evidence over scores:** Fairmatch displays the criteria behind a match, not a hidden score alone.
- **Minor safety:** School-student flows use age-appropriate language. Launch requires a parent/guardian consent policy and a designated school counsellor process.
- **Auditable operations:** Sensitive actions, AI requests, status changes and exports are logged.

## Baseline feature set

The MVP includes profile/resume management, opportunity publishing, eligibility, applications, recruitment pipeline, interview scheduling, offers, notifications, reports, consent, audit logs and explainable AI. Later releases add verified credentials, assessments, alumni/referrals, skill challenges, scholarship discovery, integrations and multilingual support.

## Delivery sequence

1. **Foundation:** Auth, organisation tenancy, roles, profile stages, RLS, audit and design system.
2. **Opportunity workflows:** Student/job-seeker profile, companies, jobs/internships, eligibility and applications.
3. **College operations:** Cohorts, drives, recruiter workflow, interview scheduling, offers and reports.
4. **Explainable AI:** Secured Node API, approved knowledge base, role-specific prompts, explanations, moderation, rate limits and AI audit events.
5. **Production readiness:** Tests, monitoring, backups, accessibility, performance, privacy review and deployment.

