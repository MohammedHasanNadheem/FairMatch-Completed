import { describe, expect, it } from 'vitest';
import { applicationProgress } from '../src/CandidateApplications';

describe('candidate application workflow progress', () => {
  it('maps active workflow states in sequence', () => {
    expect(applicationProgress('submitted')).toBe(25);
    expect(applicationProgress('shortlisted')).toBe(50);
    expect(applicationProgress('interviewing')).toBe(75);
    expect(applicationProgress('offered')).toBe(100);
  });

  it('does not present closed outcomes as active progress', () => {
    expect(applicationProgress('rejected')).toBe(0);
    expect(applicationProgress('withdrawn')).toBe(0);
  });
});
