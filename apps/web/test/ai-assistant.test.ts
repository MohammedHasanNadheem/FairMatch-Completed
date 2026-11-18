import { describe, expect, it } from 'vitest';
import { assistantContextsFor, buildYouthGuidance, entitlementFrom } from '../src/AiCareerAssistant';

describe('role-aware FairMatch Guide', () => {
  it('never exposes recruiting support to candidates', () => {
    expect(assistantContextsFor('job_seeker').map((item) => item.id)).toEqual(['career_guidance', 'opportunity_match', 'application_support']);
    expect(assistantContextsFor('job_seeker').map((item) => item.id)).not.toContain('recruiting_support');
  });

  it('keeps company, college and platform contexts separate', () => {
    expect(assistantContextsFor('company_hr')[0].id).toBe('recruiting_support');
    expect(assistantContextsFor('college_admin')[0].id).toBe('cohort_insight');
    expect(assistantContextsFor('platform_admin')[0].id).toBe('platform_operations');
  });

  it('provides explainable protected guidance for under-18 school users', () => {
    const answer = buildYouthGuidance('Create a four week career plan for science.');
    expect(answer.answer).toContain('exploration cycle');
    expect(answer.whyShown.join(' ')).toContain('no profile or resume data left FairMatch');
    expect(answer.humanReviewRecommended).toBe(true);
    expect(answer.nextActions.length).toBeGreaterThan(0);
  });

  it('normalises server entitlements without allowing invalid or negative usage', () => {
    expect(entitlementFrom({
      planCode: 'free', planName: 'FairMatch Free', status: 'active', monthlyLimit: 30,
      usedThisMonth: -2, remaining: 30, renewsAt: '2026-09-01T00:00:00Z', upgradeAvailable: true,
    })).toMatchObject({ planCode: 'free', usedThisMonth: 0, remaining: 30, upgradeAvailable: true });
    expect(entitlementFrom({ monthlyLimit: 30 })).toBeNull();
  });
});
