import assert from 'node:assert/strict';
import test from 'node:test';
import { contextAllowsRole, minimisePrompt, requiresYouthSafeMode } from '../dist/ai-policy.js';

const roles = [
  'school_student',
  'college_student',
  'job_seeker',
  'college_coordinator',
  'college_admin',
  'company_hr',
  'company_admin',
  'platform_admin',
];

const contexts = [
  'career_guidance',
  'opportunity_match',
  'application_support',
  'cohort_insight',
  'recruiting_support',
  'platform_operations',
];

test('AI RBAC matrix across all 8 roles x 6 contexts (48 cases)', () => {
  for (const role of roles) {
    for (const context of contexts) {
      const allowed = contextAllowsRole(context, role);
      const isCandidate = ['school_student', 'college_student', 'job_seeker'].includes(role);
      const isCollege = ['college_coordinator', 'college_admin'].includes(role);
      const isCompany = ['company_hr', 'company_admin'].includes(role);
      const expected =
        (['career_guidance', 'opportunity_match', 'application_support'].includes(context) && isCandidate) ||
        (context === 'cohort_insight' && isCollege) ||
        (context === 'recruiting_support' && isCompany) ||
        (context === 'platform_operations' && role === 'platform_admin');
      assert.equal(allowed, expected, `Mismatch for role=${role}, context=${context}`);
    }
  }
});

test('PII minimisation across 100 synthetic prompts', () => {
  for (let i = 0; i < 100; i += 1) {
    const email = `candidate${i}@example.com`;
    const phone = `98765432${String(i).padStart(2, '0')}`;
    const output = minimisePrompt(`Contact ${email} or +91 ${phone} about role #${i}`);
    assert.equal(output.includes(email), false);
    assert.equal(output.includes(phone), false);
  }
});

test('Youth-safe mode matrix across all roles and age bands', () => {
  for (const role of roles) {
    for (const band of ['under_18', '18_plus', undefined]) {
      const expected = role === 'school_student' && band !== '18_plus';
      assert.equal(requiresYouthSafeMode(role, band), expected);
    }
  }
});
