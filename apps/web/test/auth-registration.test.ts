import { describe, expect, it } from 'vitest';
import { signUpNeedsExistingAccountHelp } from '../src/AuthDialog';

describe('registration response handling', () => {
  it('does not present an existing account as a newly created account', () => {
    expect(signUpNeedsExistingAccountHelp(false, 0)).toBe(true);
  });

  it('accepts a newly created email-confirmation account', () => {
    expect(signUpNeedsExistingAccountHelp(false, 1)).toBe(false);
  });

  it('accepts a signup that immediately created a session', () => {
    expect(signUpNeedsExistingAccountHelp(true, 0)).toBe(false);
  });
});
