import assert from 'node:assert/strict';
import test from 'node:test';
import { contextAllowsRole, minimisePrompt, requiresYouthSafeMode } from '../dist/ai-policy.js';

test('AI prompt minimisation removes common direct identifiers', () => {
  const value = minimisePrompt('Email alex@example.com or call +91 9876543210 using 123456789012.');
  assert.equal(value.includes('alex@example.com'), false);
  assert.equal(value.includes('9876543210'), false);
  assert.equal(value.includes('123456789012'), false);
});

test('AI contexts are limited to appropriate Fairmatch roles', () => {
  assert.equal(contextAllowsRole('career_guidance', 'school_student'), true);
  assert.equal(contextAllowsRole('cohort_insight', 'college_student'), false);
  assert.equal(contextAllowsRole('cohort_insight', 'college_admin'), true);
  assert.equal(contextAllowsRole('recruiting_support', 'company_hr'), true);
  assert.equal(contextAllowsRole('recruiting_support', 'job_seeker'), false);
  assert.equal(contextAllowsRole('platform_operations', 'platform_admin'), true);
  assert.equal(contextAllowsRole('platform_operations', 'company_admin'), false);
});

test('school students use youth-safe mode unless they attest that they are adults', () => {
  assert.equal(requiresYouthSafeMode('school_student', 'under_18'), true);
  assert.equal(requiresYouthSafeMode('school_student', '18_plus'), false);
  assert.equal(requiresYouthSafeMode('college_student'), false);
});
