export type AiContextType = 'career_guidance' | 'opportunity_match' | 'application_support' | 'cohort_insight' | 'recruiting_support' | 'platform_operations';

export function minimisePrompt(message: string): string {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[phone removed]')
    .replace(/\b\d{12}\b/g, '[government-id removed]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[tax-id removed]')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s]+/gi, '[profile-link removed]')
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
