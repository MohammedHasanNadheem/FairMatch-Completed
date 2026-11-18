import { describe, expect, it } from 'vitest';
import { validateCandidateDocument } from '../src/CandidateDocuments';

describe('candidate document validation', () => {
  it('accepts a small PDF resume', () => {
    expect(validateCandidateDocument({ name: 'resume.pdf', size: 200_000, type: 'application/pdf' })).toBeNull();
  });

  it('rejects executable or mismatched files', () => {
    expect(validateCandidateDocument({ name: 'resume.exe', size: 1000, type: 'application/octet-stream' })).toContain('PDF or DOCX');
  });

  it('enforces the private vault size limit', () => {
    expect(validateCandidateDocument({ name: 'resume.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' })).toContain('5 MB');
  });
});
