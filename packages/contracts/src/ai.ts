import { z } from 'zod';

export const aiContextTypeSchema = z.enum([
  'career_guidance',
  'opportunity_match',
  'application_support',
  'cohort_insight',
  'recruiting_support',
  'platform_operations',
]);
export type AiContextType = z.infer<typeof aiContextTypeSchema>;

export const aiHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4_000),
});

export const aiAssistantRequestSchema = z.object({
  message: z.string().trim().min(2).max(4_000),
  contextType: aiContextTypeSchema,
  resourceId: z.string().uuid().optional(),
  ageBand: z.enum(['under_18', '18_plus']).optional(),
  history: z.array(aiHistoryItemSchema).max(8).default([]),
});
export type AiAssistantRequest = z.infer<typeof aiAssistantRequestSchema>;

export const explainableAiAnswerSchema = z.object({
  answer: z.string().min(1).max(5_000),
  whyShown: z.array(z.string().min(1).max(500)).max(6),
  strengths: z.array(z.string().min(1).max(300)).max(6),
  gaps: z.array(z.string().min(1).max(300)).max(6),
  confidence: z.enum(['low', 'medium', 'high']),
  limitations: z.string().min(1).max(1_200),
  nextActions: z.array(z.string().min(1).max(400)).min(1).max(6),
  followUpPrompts: z.array(z.string().min(1).max(300)).max(4),
  humanReviewRecommended: z.boolean(),
});
export type ExplainableAiAnswer = z.infer<typeof explainableAiAnswerSchema>;

export const explainableAiJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    whyShown: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    gaps: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    limitations: { type: 'string' },
    nextActions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    followUpPrompts: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    humanReviewRecommended: { type: 'boolean' },
  },
  required: ['answer', 'whyShown', 'strengths', 'gaps', 'confidence', 'limitations', 'nextActions', 'followUpPrompts', 'humanReviewRecommended'],
} as const;

export function emptyExplainableAnswer(): ExplainableAiAnswer {
  return {
    answer: 'AI guidance is temporarily unavailable.',
    whyShown: [],
    strengths: [],
    gaps: [],
    confidence: 'low',
    limitations: 'No profile or message content was sent to an external AI provider.',
    nextActions: ['Try again later or ask a trusted human adviser.'],
    followUpPrompts: [],
    humanReviewRecommended: true,
  };
}

/** Remove common direct identifiers before any provider call or AI transcript write. */
export function minimisePrompt(message: string): string {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[phone removed]')
    .replace(/\b\d{12}\b/g, '[government-id removed]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[tax-id removed]')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s]+/gi, '[profile-link removed]')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

export function contextAllowsRole(contextType: AiContextType, role: string): boolean {
  const candidateRoles = new Set(['school_student', 'college_student', 'job_seeker']);
  const collegeRoles = new Set(['college_coordinator', 'college_admin']);
  const companyRoles = new Set(['company_hr', 'company_admin']);
  if (contextType === 'career_guidance' || contextType === 'opportunity_match' || contextType === 'application_support') return candidateRoles.has(role);
  if (contextType === 'cohort_insight') return collegeRoles.has(role);
  if (contextType === 'recruiting_support') return companyRoles.has(role);
  return contextType === 'platform_operations' && role === 'platform_admin';
}

export function requiresYouthSafeMode(role: string, ageBand?: 'under_18' | '18_plus'): boolean {
  return role === 'school_student' && ageBand !== '18_plus';
}
