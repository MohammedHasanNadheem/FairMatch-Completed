import { z } from 'zod';
export * from './ai.js';

export const roleSchema = z.enum([
  'school_student',
  'college_student',
  'job_seeker',
  'college_coordinator',
  'college_admin',
  'company_hr',
  'company_admin',
  'platform_admin',
]);
export type Role = z.infer<typeof roleSchema>;

export const careerStageSchema = z.enum(['school', 'college', 'experienced']);
export type CareerStage = z.infer<typeof careerStageSchema>;

export const applicationStatusSchema = z.enum(['draft', 'submitted', 'shortlisted', 'interviewing', 'offered', 'rejected', 'withdrawn']);
export const driveSchema = z.object({
  title: z.string().trim().min(3).max(120),
  employerId: z.string().uuid(),
  roleTitle: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  employmentType: z.enum(['internship', 'full_time', 'part_time', 'apprenticeship', 'contract']),
  minCgpa: z.number().min(0).max(10).optional(),
  maxArrears: z.number().int().min(0).max(99).optional(),
  applicationDeadline: z.string().datetime(),
});
export type DriveInput = z.infer<typeof driveSchema>;
export const applicationSchema = z.object({
  driveId: z.string().uuid(),
  resumePath: z.string().trim().min(1).max(500).optional(),
  coverNote: z.string().trim().max(2_000).optional(),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const permissions: Record<Role, readonly string[]> = {
  school_student: ['profile:read:self', 'profile:update:self', 'career:read:self', 'ai:career:self'],
  college_student: ['profile:read:self', 'profile:update:self', 'opportunity:read', 'application:create:self', 'application:read:self', 'ai:career:self'],
  job_seeker: ['profile:read:self', 'profile:update:self', 'opportunity:read', 'application:create:self', 'application:read:self', 'ai:career:self'],
  college_coordinator: ['candidate:read:institution', 'opportunity:read:institution', 'application:read:institution', 'application:update:institution', 'report:read:institution', 'ai:cohort:institution'],
  college_admin: ['college:manage', 'candidate:read:institution', 'report:read:institution', 'audit:read:institution', 'ai:cohort:institution'],
  company_hr: ['opportunity:read:owned', 'opportunity:create', 'opportunity:update:owned', 'application:read:owned', 'application:update:owned', 'ai:recruiting:owned'],
  company_admin: ['company:manage', 'opportunity:read:company', 'application:read:company', 'audit:read:company', 'ai:recruiting:company'],
  platform_admin: ['*'],
};
