import { createHash } from 'node:crypto';
import { z } from 'zod';

type AiContextType = 'career_guidance' | 'opportunity_match' | 'application_support' | 'cohort_insight' | 'recruiting_support' | 'platform_operations';

const aiContextTypeSchema = z.enum(['career_guidance', 'opportunity_match', 'application_support', 'cohort_insight', 'recruiting_support', 'platform_operations']);
const aiAssistantRequestSchema = z.object({
  message: z.string().trim().min(2).max(4_000),
  contextType: aiContextTypeSchema,
  resourceId: z.string().uuid().optional(),
  ageBand: z.enum(['under_18', '18_plus']).optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4_000) })).max(8).default([]),
});
const explainableAiAnswerSchema = z.object({
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
const explainableAiJsonSchema = {
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

function minimisePrompt(message: string): string {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[phone removed]')
    .replace(/\b\d{12}\b/g, '[government-id removed]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[tax-id removed]')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s]+/gi, '[profile-link removed]')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

function contextAllowsRole(contextType: AiContextType, role: string): boolean {
  if (['career_guidance', 'opportunity_match', 'application_support'].includes(contextType)) return ['school_student', 'college_student', 'job_seeker'].includes(role);
  if (contextType === 'cohort_insight') return ['college_coordinator', 'college_admin'].includes(role);
  if (contextType === 'recruiting_support') return ['company_hr', 'company_admin'].includes(role);
  return contextType === 'platform_operations' && role === 'platform_admin';
}

function requiresYouthSafeMode(role: string, ageBand?: 'under_18' | '18_plus') {
  return role === 'school_student' && ageBand !== '18_plus';
}

export const config = { maxDuration: 30 };

type AuthenticatedProfile = { id: string; role: string; active: boolean };
type CareerProfile = {
  stage?: string;
  headline?: string | null;
  location?: string | null;
  skills?: unknown;
  education?: unknown;
  experience?: unknown;
  preferences?: unknown;
};

type RateBucket = { minute: number[]; day: number[] };
type AiRateDecision = {
  allowed: boolean;
  reason?: string;
  planCode?: string;
  planName?: string;
  monthlyLimit?: number;
  usedThisMonth?: number;
  remaining?: number;
  renewsAt?: string;
  upgradeAvailable?: boolean;
  retryAfterSeconds?: number;
};
const globalRateBuckets = globalThis as typeof globalThis & { fairmatchAiRateBuckets?: Map<string, RateBucket> };
const rateBuckets = globalRateBuckets.fairmatchAiRateBuckets ?? new Map<string, RateBucket>();
globalRateBuckets.fairmatchAiRateBuckets = rateBuckets;

const roleInstructions: Record<AiContextType, string> = {
  career_guidance: 'Help the person explore realistic career directions and learning steps. Explain which supplied evidence supports each suggestion. Never present a path as destiny.',
  opportunity_match: 'Explain fit for a role using only supplied skills, preferences and verified experience. Separate evidence, gaps and assumptions. Never promise selection.',
  application_support: 'Help improve an application, interview plan or cover note without inventing achievements. Ask for missing evidence and preserve the person’s authentic voice.',
  cohort_insight: 'Support college placement operations using aggregate, non-identifying reasoning. Do not rank individual students or infer sensitive traits. Recommend a human review for consequential action.',
  recruiting_support: 'Support fair hiring operations. Do not make, automate or recommend final employment decisions. Do not rank candidates or use protected or inferred sensitive traits. Focus on job-relevant, documented evidence and structured human review.',
  platform_operations: 'Support platform governance, workflow design and operational troubleshooting. Do not disclose user records, secrets or cross-tenant information. Require human approval for access, suspension or other consequential actions.',
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function requiredEnvironment() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !supabaseKey || !openAiKey) return null;
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), supabaseKey, openAiKey };
}

async function supabaseRequest(url: string, key: string, token: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
  });
}

async function authenticate(supabaseUrl: string, key: string, token: string): Promise<AuthenticatedProfile | null> {
  const userResponse = await supabaseRequest(`${supabaseUrl}/auth/v1/user`, key, token);
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id?: string };
  if (!user.id) return null;

  const profileResponse = await supabaseRequest(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active&limit=1`,
    key,
    token,
  );
  if (!profileResponse.ok) return null;
  const profiles = await profileResponse.json() as AuthenticatedProfile[];
  const profile = profiles[0];
  return profile?.active ? profile : null;
}

function stringList(value: unknown, limit = 24): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => minimisePrompt(item).slice(0, 160)).filter(Boolean).slice(0, limit);
}

function compactRecords(value: unknown, fields: string[], limit: number): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const compact = Object.fromEntries(fields.flatMap((field) => typeof record[field] === 'string' && record[field]
      ? [[field, minimisePrompt(String(record[field])).slice(0, 500)]]
      : []));
    return Object.keys(compact).length ? [compact] : [];
  });
}

async function loadMinimisedCareerContext(supabaseUrl: string, key: string, token: string, profileId: string) {
  const response = await supabaseRequest(
    `${supabaseUrl}/rest/v1/career_profiles?profile_id=eq.${encodeURIComponent(profileId)}&select=stage,headline,location,skills,education,experience,preferences&limit=1`,
    key,
    token,
  );
  if (!response.ok) return {};
  const [profile] = await response.json() as CareerProfile[];
  if (!profile) return {};
  const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences as Record<string, unknown> : {};
  return {
    stage: typeof profile.stage === 'string' ? profile.stage : undefined,
    headline: typeof profile.headline === 'string' ? minimisePrompt(profile.headline).slice(0, 180) : undefined,
    preferredRegion: typeof profile.location === 'string' ? minimisePrompt(profile.location).slice(0, 120) : undefined,
    skills: stringList(profile.skills),
    education: compactRecords(profile.education, ['qualification', 'field', 'endYear'], 6),
    experience: compactRecords(profile.experience, ['title', 'description', 'startDate', 'endDate'], 8),
    preferences: {
      targetRoles: stringList(preferences.targetRoles, 12),
      preferredLocations: stringList(preferences.preferredLocations, 12),
      workModes: stringList(preferences.workModes, 6),
      opportunityTypes: stringList(preferences.opportunityTypes, 8),
    },
  };
}

function authoriseInstanceRate(profileId: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(profileId) ?? { minute: [], day: [] };
  bucket.minute = bucket.minute.filter((time) => now - time < 60_000);
  bucket.day = bucket.day.filter((time) => now - time < 86_400_000);
  if (bucket.minute.length >= 8 || bucket.day.length >= 100) return false;
  bucket.minute.push(now);
  bucket.day.push(now);
  rateBuckets.set(profileId, bucket);
  return true;
}

async function authoriseDistributedRate(supabaseUrl: string, key: string, token: string, contextType: AiContextType): Promise<AiRateDecision | null> {
  try {
    const response = await supabaseRequest(`${supabaseUrl}/rest/v1/rpc/authorise_ai_request`, key, token, {
      method: 'POST',
      body: JSON.stringify({ request_context: contextType }),
    });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) return { allowed: false, reason: 'authorisation_failed' };
    const result = await response.json() as Partial<AiRateDecision> | boolean;
    return typeof result === 'boolean'
      ? { allowed: result }
      : { ...result, allowed: result.allowed === true };
  } catch {
    return null;
  }
}

async function moderate(openAiKey: string, input: string) {
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`moderation_${response.status}`);
  const payload = await response.json() as { results?: Array<{ flagged?: boolean }> };
  return Boolean(payload.results?.[0]?.flagged);
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'output_text' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

async function saveExchange(supabaseUrl: string, key: string, token: string, body: {
  contextType: AiContextType;
  userContent: string;
  answer: unknown;
}) {
  try {
    const response = await supabaseRequest(`${supabaseUrl}/rest/v1/rpc/save_ai_exchange`, key, token, {
      method: 'POST',
      body: JSON.stringify({
        request_context: body.contextType,
        user_content: body.userContent,
        assistant_payload: body.answer,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function handle(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  const environment = requiredEnvironment();
  if (!environment) return json({ error: 'The AI service is not configured for this deployment.' }, 503);

  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json({ error: 'Sign in again to use FairMatch Guide.' }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const parsed = aiAssistantRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Check the message and assistant mode, then try again.' }, 400);

  let profile: AuthenticatedProfile | null;
  try {
    profile = await authenticate(environment.supabaseUrl, environment.supabaseKey, token);
  } catch {
    return json({ error: 'Authentication could not be verified.' }, 503);
  }
  if (!profile) return json({ error: 'Your account is inactive or the session has expired.' }, 401);
  if (!contextAllowsRole(parsed.data.contextType, profile.role)) return json({ error: 'This assistant mode is not available for your role.' }, 403);
  if (requiresYouthSafeMode(profile.role, parsed.data.ageBand)) {
    return json({ error: 'School users under 18 use FairMatch Guided Mode without sending data to an external AI provider.', code: 'YOUTH_SAFE_MODE' }, 403);
  }

  const distributedRate = await authoriseDistributedRate(environment.supabaseUrl, environment.supabaseKey, token, parsed.data.contextType);
  if (distributedRate && !distributedRate.allowed) {
    const planLimit = distributedRate.reason === 'monthly_plan_limit';
    return json({
      error: planLimit
        ? 'Your monthly FairMatch AI allowance is complete. Upgrade for more guided requests or wait for the monthly reset.'
        : 'You have reached a short-term assistant safety limit. Please wait before trying again.',
      code: planLimit ? 'AI_PLAN_LIMIT' : 'AI_RATE_LIMIT',
      usage: distributedRate,
      upgradeAvailable: planLimit && distributedRate.upgradeAvailable === true,
    }, 429, { 'Retry-After': String(distributedRate.retryAfterSeconds ?? (planLimit ? 3600 : 60)) });
  }
  if (!distributedRate && !authoriseInstanceRate(profile.id)) {
    return json({ error: 'You have reached a short-term assistant safety limit. Please wait before trying again.', code: 'AI_RATE_LIMIT' }, 429, { 'Retry-After': '60' });
  }

  const cleanMessage = minimisePrompt(parsed.data.message);
  const cleanHistory = parsed.data.history.map((item) => ({ role: item.role, content: minimisePrompt(item.content) })).filter((item) => item.content);
  if (!cleanMessage) return json({ error: 'Enter a career-related question without personal contact details.' }, 400);

  try {
    if (await moderate(environment.openAiKey, cleanMessage)) {
      return json({
        error: 'This request needs human support rather than automated career guidance. Contact a trusted adviser or local emergency service if anyone may be in immediate danger.',
        code: 'SAFETY_REVIEW',
      }, 422);
    }
  } catch {
    return json({ error: 'The safety check is temporarily unavailable. No profile data was sent for generation.' }, 503);
  }

  const candidateRole = ['school_student', 'college_student', 'job_seeker'].includes(profile.role);
  const careerContext = candidateRole
    ? await loadMinimisedCareerContext(environment.supabaseUrl, environment.supabaseKey, token, profile.id)
    : {};
  const safetyIdentifier = `fm_${createHash('sha256').update(`fairmatch:${profile.id}`).digest('hex').slice(0, 32)}`;
  const systemPrompt = [
    'You are FairMatch Guide, an explainable career and workforce assistant.',
    'Use only the supplied, minimised context and the user’s words. Clearly label assumptions and missing evidence.',
    'Never request or reveal phone numbers, email addresses, home addresses, government identifiers, health data, religion, caste, race, gender, disability, political views or other sensitive traits.',
    'Never claim certainty, guarantee admission, employment or selection, or replace a qualified counsellor, recruiter, educator or administrator.',
    'Keep advice practical, specific, respectful and suitable for the user role. Do not fabricate live vacancies, salaries, policies, credentials or completed actions.',
    roleInstructions[parsed.data.contextType],
    `Authenticated role: ${profile.role.replace(/_/g, ' ')}.`,
  ].join('\n');
  const userPrompt = JSON.stringify({
    question: cleanMessage,
    minimisedCareerContext: careerContext,
    assistantMode: parsed.data.contextType,
  });

  let openAiResponse: Response;
  try {
    openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${environment.openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-5.6-terra',
        input: [
          { role: 'system', content: systemPrompt },
          ...cleanHistory,
          { role: 'user', content: userPrompt },
        ],
        reasoning: { effort: 'low' },
        text: {
          verbosity: 'medium',
          format: { type: 'json_schema', name: 'fairmatch_explainable_guidance', strict: true, schema: explainableAiJsonSchema },
        },
        max_output_tokens: 1_200,
        store: false,
        safety_identifier: safetyIdentifier,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return json({ error: 'FairMatch Guide did not respond in time. Please try again.' }, 504);
  }

  if (!openAiResponse.ok) {
    const status = openAiResponse.status;
    if (status === 401) return json({ error: 'The server AI credential must be replaced by the administrator.' }, 503);
    if (status === 429) return json({ error: 'The OpenAI project has reached its rate or billing limit. Check OpenAI billing, then try again.' }, 503);
    return json({ error: 'The AI provider could not complete this request.' }, 502);
  }

  const providerPayload = await openAiResponse.json() as Record<string, unknown>;
  const outputText = extractOutputText(providerPayload);
  if (!outputText) return json({ error: 'The assistant returned no usable guidance.' }, 502);
  let answer: unknown;
  try { answer = JSON.parse(outputText); } catch { return json({ error: 'The assistant response could not be validated.' }, 502); }
  const validated = explainableAiAnswerSchema.safeParse(answer);
  if (!validated.success) return json({ error: 'The assistant response did not meet FairMatch’s explanation standard.' }, 502);

  const saved = await saveExchange(environment.supabaseUrl, environment.supabaseKey, token, {
    contextType: parsed.data.contextType,
    userContent: cleanMessage,
    answer: validated.data,
  });
  return json({
    answer: validated.data,
    saved,
    usage: distributedRate ?? undefined,
    privacy: 'Direct identifiers were removed before processing.',
  });
}

export default { fetch: handle };
