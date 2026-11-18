import { describe, expect, it } from 'vitest';
import { explainOpportunityMatch } from '../src/OpportunityMarketplace';

const opportunity = { title: 'Frontend Engineer', skills: ['React', 'TypeScript', 'CSS'], location: 'Chennai', work_mode: 'hybrid', type: 'full_time' };

describe('transparent opportunity matching', () => {
  it('raises fit only when profile evidence aligns', () => {
    const strong = explainOpportunityMatch(opportunity, { skills: ['React', 'TypeScript', 'CSS'], location: 'Chennai', preferences: { targetRoles: ['Frontend Engineer'], preferredLocations: ['Chennai'], workModes: ['hybrid'], opportunityTypes: ['full_time'] } });
    const weak = explainOpportunityMatch(opportunity, { skills: ['Accounting'], location: 'Madurai', preferences: {} });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.strengths).toContain('React matches the role');
    expect(weak.gaps).toContain('React is not recorded in your profile');
  });

  it('declares low confidence when profile evidence is unavailable', () => {
    expect(explainOpportunityMatch(opportunity, null).confidence).toBe('low');
  });
});
